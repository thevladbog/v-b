import { describe, expect, it } from "vitest";
import {
  createTimerHandler,
  timerHandler,
  type TimerRuntime,
  type YandexFunctionContext,
  type YandexTimerEvent,
} from "../src/timer-handler.js";

const timerEvent = (): YandexTimerEvent => ({
  messages: [
    {
      event_metadata: {
        event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        event_type: "yandex.cloud.events.serverless.triggers.TimerMessage",
        created_at: "2026-08-20T14:00:00Z",
        cloud_id: "cloud-id",
        folder_id: "folder-id",
      },
      details: {
        trigger_id: "trigger-id",
        payload: "contact-delivery",
      },
    },
  ],
});

const functionContext = (): YandexFunctionContext => ({
  requestId: "function-invocation-id",
  token: {
    access_token: "short-lived-iam-token",
    expires_in: 3600,
    token_type: "Bearer",
  },
});

describe("Yandex timer handler", () => {
  // Catches an externally-triggerable side effect before the exact single TimerMessage is authenticated structurally.
  it.each([
    {},
    { messages: [] },
    { messages: [...timerEvent().messages, ...timerEvent().messages] },
    {
      messages: [{
        ...timerEvent().messages[0],
        event_metadata: {
          ...timerEvent().messages[0]!.event_metadata,
          event_type: "unexpected.event",
        },
      }],
    },
  ])("rejects malformed or wrong events before token access or runtime composition", async (event) => {
    let tokenReads = 0;
    let compositions = 0;
    const context = {
      requestId: "function-invocation-id",
      get token() {
        tokenReads += 1;
        return functionContext().token;
      },
    };
    const handler = createTimerHandler({
      createRuntime: async () => {
        compositions += 1;
        throw new Error("must not compose");
      },
    });

    await expect(handler(event, context)).rejects.toThrow("invalid_timer_event");
    expect(tokenReads).toBe(0);
    expect(compositions).toBe(0);
  });

  // Catches static/malformed authorization and proves composition waits for a valid invocation token.
  it.each([undefined, "", "\n", "x".repeat(8_193)])(
    "requires a non-empty bounded context.token.access_token",
    async (accessToken) => {
      let compositions = 0;
      const handler = createTimerHandler({
        createRuntime: async () => {
          compositions += 1;
          throw new Error("must not compose");
        },
      });

      await expect(handler(timerEvent(), {
        ...functionContext(),
        token: { ...functionContext().token!, access_token: accessToken as string },
      })).rejects.toThrow("invalid_timer_context");
      expect(compositions).toBe(0);
    },
  );

  // Catches omission of either the delivery or retention pass and accidental visitor-bearing timer responses.
  it("drains, applies retention, closes the runtime, and returns content-free 204", async () => {
    const actions: string[] = [];
    let runtimeToken = "";
    const runtime: TimerRuntime = {
      drainOutbox: async ({ limit, workerId }) => {
        actions.push(`drain:${limit}:${workerId}`);
        return { leased: 1, delivered: 1, rescheduled: 0, failed: 0, leaseLost: 0 };
      },
      runRetention: async (referenceTime) => {
        actions.push(`retain:${referenceTime.toISOString()}`);
        return { payloadsErased: 0, outboxDeleted: 0, requestsDeleted: 0 };
      },
      close: async () => {
        actions.push("close");
      },
    };
    const handler = createTimerHandler({
      now: () => new Date("2026-08-20T14:00:00.000Z"),
      createRuntime: async ({ getIamToken }) => {
        runtimeToken = await getIamToken();
        return runtime;
      },
    });

    await expect(handler(timerEvent(), functionContext())).resolves.toEqual({ statusCode: 204 });
    expect(runtimeToken).toBe("short-lived-iam-token");
    expect(actions).toEqual([
      "drain:25:timer-function-invocation-id",
      "retain:2026-08-20T14:00:00.000Z",
      "close",
    ]);
  });

  // Catches a resource leak when provider delivery throws during a retried timer invocation.
  it("closes the runtime when delivery fails", async () => {
    let closed = false;
    const handler = createTimerHandler({
      createRuntime: async () => ({
        drainOutbox: async () => Promise.reject(new Error("delivery_failed")),
        runRetention: async () => ({ payloadsErased: 0, outboxDeleted: 0, requestsDeleted: 0 }),
        close: async () => { closed = true; },
      }),
    });

    await expect(handler(timerEvent(), functionContext())).rejects.toThrow("delivery_failed");
    expect(closed).toBe(true);
  });

  // Catches default-handler secret/config access for unauthenticated event shapes.
  it("keeps the exported default handler fail-closed before environment access", async () => {
    await expect(timerHandler({}, {
      get token() {
        throw new Error("token must stay unread");
      },
    })).rejects.toThrow("invalid_timer_event");
  });
});
