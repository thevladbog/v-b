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
  it("reports only a bounded top-level shape when the provider wrapper is rejected", async () => {
    const shapes: string[] = [];
    const handler = createTimerHandler({
      createRuntime: async () => { throw new Error("must not compose"); },
      reportInvalidEventShape: (shape) => shapes.push(shape),
    });

    await expect(handler({ messages: timerEvent().messages, tracing_context: {} }, functionContext()))
      .rejects.toThrow("invalid_timer_event");
    expect(shapes).toEqual(["object:messages,tracing_context"]);
  });

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

  // Catches malformed authorization only when a leased delivery actually requests the lazy token.
  it.each([undefined, "", "\n", "x".repeat(8_193)])(
    "validates context.token.access_token when provider work requests it",
    async (accessToken) => {
      let compositions = 0;
      let closed = false;
      const handler = createTimerHandler({
        createRuntime: async ({ getIamToken }) => {
          compositions += 1;
          return {
            drainOutbox: async () => {
              await getIamToken();
              return { leased: 1, delivered: 0, rescheduled: 1, failed: 0, leaseLost: 0 };
            },
            runRetention: async () => ({ payloadsErased: 0, outboxDeleted: 0, requestsDeleted: 0 }),
            close: async () => { closed = true; },
          };
        },
      });

      await expect(handler(timerEvent(), {
        ...functionContext(),
        token: { ...functionContext().token!, access_token: accessToken as string },
      })).rejects.toThrow("invalid_timer_context");
      expect(compositions).toBe(1);
      expect(closed).toBe(true);
    },
  );

  // Catches eager token access that breaks empty-queue and retention-only timer invocations.
  it("runs an empty delivery and retention pass without reading context.token", async () => {
    let tokenReads = 0;
    const actions: string[] = [];
    const context = {
      requestId: "function-invocation-id",
      get token() {
        tokenReads += 1;
        return undefined;
      },
    };
    const handler = createTimerHandler({
      createRuntime: async () => ({
        drainOutbox: async () => {
          actions.push("drain");
          return { leased: 0, delivered: 0, rescheduled: 0, failed: 0, leaseLost: 0 };
        },
        runRetention: async () => {
          actions.push("retention");
          return { payloadsErased: 0, outboxDeleted: 0, requestsDeleted: 0 };
        },
        close: async () => { actions.push("close"); },
      }),
    });

    await expect(handler(timerEvent(), context)).resolves.toEqual({ statusCode: 204 });
    expect(tokenReads).toBe(0);
    expect(actions).toEqual(["drain", "retention", "close"]);
  });

  // Catches omission of either the delivery or retention pass and accidental visitor-bearing timer responses.
  it("drains, applies retention, closes the runtime, and returns content-free 204", async () => {
    const actions: string[] = [];
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
      createRuntime: async () => runtime,
    });

    await expect(handler(timerEvent(), functionContext())).resolves.toEqual({ statusCode: 204 });
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
