import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { encryptPayload, type DeliveryKind } from "../src/crypto.js";
import type {
  BeginDeliveryAttemptResult,
  LeasedOutboxJob,
  OutboxDeliveryRepository,
  StateUpdateResult,
} from "../src/outbox-repository.js";
import {
  PostboxDeliveryError,
  type PreparedPostboxDelivery,
  type PostboxSendInput,
  type PostboxSender,
} from "../src/postbox.js";
import type { TelemetryEvent } from "../src/telemetry.js";
import { createDrainOutbox } from "../src/worker.js";

const encryptionKey = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);
const now = new Date("2026-08-20T14:00:00.000Z");
const durableTelegram = {
  locale: "en" as const,
  name: "Vlad",
  contact: "@thevladbog",
  message: "A concrete product problem",
  sourcePath: "/en/" as const,
  consentId: CURRENT_CONTACT_CONSENT_ID,
};

const job = (
  id: string,
  kind: DeliveryKind,
  durable = durableTelegram,
  attemptCount = 1,
  deliveryAttemptCount = 0,
): LeasedOutboxJob => {
  const publicRequestId = "11111111-1111-4111-8111-111111111111";
  return {
    id,
    publicRequestId,
    kind,
    encryptedPayload: encryptPayload(durable, encryptionKey, {
      requestId: publicRequestId,
      kind,
    }),
    attemptCount,
    deliveryAttemptCount,
    leaseOwner: "worker-a",
    leaseExpiresAt: new Date("2026-08-20T14:01:00.000Z"),
    createdAt: new Date("2026-08-20T12:00:00.000Z"),
  };
};

class InMemoryDeliveryRepository implements OutboxDeliveryRepository {
  readonly states = new Map<string, {
    state: "leased" | "delivered" | "rescheduled" | "failed";
    providerMessageId?: string;
    nextAttemptAt?: Date;
  }>();
  readonly deliveryAttempts = new Map<string, number>();

  constructor(
    private readonly jobs: LeasedOutboxJob[],
    private readonly forcedResult: StateUpdateResult = "updated",
  ) {
    for (const item of jobs) {
      this.states.set(item.id, { state: "leased" });
      this.deliveryAttempts.set(item.id, item.deliveryAttemptCount);
    }
  }

  async leaseDue(limit: number, workerId: string): Promise<LeasedOutboxJob[]> {
    return this.jobs.slice(0, limit).map((item) => ({ ...item, leaseOwner: workerId }));
  }

  async beginDeliveryAttempt(
    jobId: string,
  ): Promise<BeginDeliveryAttemptResult> {
    if (this.forcedResult === "lease_lost") return { status: "lease_lost" };
    const current = this.deliveryAttempts.get(jobId) ?? 0;
    if (current >= 5) return { status: "attempts_exhausted" };
    const deliveryAttemptCount = current + 1;
    this.deliveryAttempts.set(jobId, deliveryAttemptCount);
    return { status: "started", deliveryAttemptCount };
  }

  async markDelivered(
    jobId: string,
    _workerId: string,
    _attemptCount: number,
    providerMessageId: string,
  ): Promise<StateUpdateResult> {
    if (this.forcedResult === "updated") {
      this.states.set(jobId, { state: "delivered", providerMessageId });
    }
    return this.forcedResult;
  }

  async reschedule(
    jobId: string,
    _workerId: string,
    _attemptCount: number,
    nextAttemptAt: Date,
  ): Promise<StateUpdateResult> {
    if (this.forcedResult === "updated") {
      this.states.set(jobId, { state: "rescheduled", nextAttemptAt });
    }
    return this.forcedResult;
  }

  async markFailed(jobId: string): Promise<StateUpdateResult> {
    if (this.forcedResult === "updated") {
      this.states.set(jobId, { state: "failed" });
    }
    return this.forcedResult;
  }
}

class CapturingSender implements PostboxSender {
  readonly prepared: PostboxSendInput[] = [];
  readonly sent: PostboxSendInput[] = [];
  discarded = 0;

  constructor(
    private readonly failFor = new Map<string, Error>(),
    private readonly prepareFailure?: Error,
  ) {}

  async prepare(input: PostboxSendInput): Promise<PreparedPostboxDelivery> {
    this.prepared.push(input);
    if (this.prepareFailure) throw this.prepareFailure;
    return {
      discard: () => { this.discarded += 1; },
      send: async () => {
        this.sent.push(input);
        const failure = this.failFor.get(input.outboxId);
        if (failure) throw failure;
        return { providerMessageId: `provider-${input.outboxId}` };
      },
    };
  }

  async send(input: PostboxSendInput): Promise<{ providerMessageId: string }> {
    return (await this.prepare(input)).send();
  }
}

const drainWith = (
  repository: OutboxDeliveryRepository,
  sender: PostboxSender,
  overrides: Record<string, unknown> = {},
) => createDrainOutbox({ repository, sender, encryptionKey, now: () => now, ...overrides });

describe("durable outbox worker", () => {
  // Catches a routing break that confirms Telegram enquiries or leaks the handle into an email address header.
  it("sends a Telegram request as one operator notification only", async () => {
    const notification = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification");
    const repository = new InMemoryDeliveryRepository([notification]);
    const sender = new CapturingSender();

    const summary = await drainWith(repository, sender)({ limit: 10, workerId: "worker-a" });

    expect(summary).toEqual({ leased: 1, delivered: 1, rescheduled: 0, failed: 0, leaseLost: 0 });
    expect(repository.states.get(notification.id)).toEqual({
      state: "delivered",
      providerMessageId: `provider-${notification.id}`,
    });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({
      outboxId: notification.id,
      recipient: "hello@v-b.tech",
      replyTo: "hello@v-b.tech",
      email: { subject: "New v-b.tech enquiry — @thevladbog" },
    });
  });

  // Catches a routing break that omits confirmation or sends either email to the wrong party.
  it("delivers independent notification and confirmation jobs for an email contact", async () => {
    const durableEmail = { ...durableTelegram, contact: "visitor@example.com" };
    const notification = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification", durableEmail);
    const confirmation = job("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "confirmation", durableEmail);
    const repository = new InMemoryDeliveryRepository([notification, confirmation]);
    const sender = new CapturingSender();

    const summary = await drainWith(repository, sender)({ limit: 10, workerId: "worker-a" });

    expect(summary.delivered).toBe(2);
    expect(sender.sent.map(({ recipient, replyTo, email }) => ({ recipient, replyTo, subject: email.subject }))).toEqual([
      {
        recipient: "hello@v-b.tech",
        replyTo: "visitor@example.com",
        subject: "New v-b.tech enquiry — visitor@example.com",
      },
      {
        recipient: "visitor@example.com",
        replyTo: "hello@v-b.tech",
        subject: "We received your v-b.tech enquiry",
      },
    ]);
  });

  // Catches coupling between jobs that would roll back a delivered notification when confirmation is temporarily unavailable.
  it("keeps notification delivered when confirmation is rescheduled", async () => {
    const durableEmail = { ...durableTelegram, contact: "visitor@example.com" };
    const notification = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification", durableEmail);
    const confirmation = job("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "confirmation", durableEmail);
    const repository = new InMemoryDeliveryRepository([notification, confirmation]);
    const sender = new CapturingSender(new Map([
      [confirmation.id, new PostboxDeliveryError("transient", "postbox_unavailable")],
    ]));

    const summary = await drainWith(repository, sender)({ limit: 10, workerId: "worker-a" });

    expect(summary).toEqual({ leased: 2, delivered: 1, rescheduled: 1, failed: 0, leaseLost: 0 });
    expect(repository.states.get(notification.id)?.state).toBe("delivered");
    expect(repository.states.get(confirmation.id)).toEqual({
      state: "rescheduled",
      nextAttemptAt: new Date("2026-08-20T14:01:00.000Z"),
    });
  });

  // Catches retry timing being derived from lease recovery instead of actual provider attempts.
  it.each([
    [0, "2026-08-20T14:01:00.000Z"],
    [1, "2026-08-20T14:05:00.000Z"],
    [2, "2026-08-20T14:15:00.000Z"],
    [3, "2026-08-20T15:00:00.000Z"],
  ])("reschedules after persisted provider attempt %s at the approved delay", async (deliveryAttemptCount, expected) => {
    const item = job(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "notification",
      durableTelegram,
      37,
      deliveryAttemptCount,
    );
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender(new Map([
      [item.id, new PostboxDeliveryError("transient", "postbox_unavailable")],
    ]));

    await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(repository.states.get(item.id)).toEqual({
      state: "rescheduled",
      nextAttemptAt: new Date(expected),
    });
  });

  // Catches unbounded retries after the fifth provider attempt.
  it("marks the fifth transient failure terminal", async () => {
    const item = job(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "notification",
      durableTelegram,
      12,
      4,
    );
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender(new Map([
      [item.id, new PostboxDeliveryError("transient", "postbox_unavailable")],
    ]));

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary.failed).toBe(1);
    expect(repository.states.get(item.id)?.state).toBe("failed");
  });

  // Catches lease recovery generations incorrectly consuming the provider delivery budget.
  it("delivers after many lease recoveries when no provider attempt has begun", async () => {
    const item = job(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "notification",
      durableTelegram,
      99,
      0,
    );
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender();

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary.delivered).toBe(1);
    expect(repository.deliveryAttempts.get(item.id)).toBe(1);
    expect(sender.sent).toHaveLength(1);
  });

  // Catches a sixth provider call after all five delivery-attempt reservations are exhausted.
  it("terminally closes an exhausted provider budget without a sixth call", async () => {
    const item = job(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "notification",
      durableTelegram,
      8,
      5,
    );
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender();

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary.failed).toBe(1);
    expect(repository.states.get(item.id)?.state).toBe("failed");
    expect(sender.sent).toHaveLength(0);
  });

  // Catches poison-message retries after a documented terminal provider rejection.
  it("marks a terminal provider rejection failed immediately", async () => {
    const item = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification");
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender(new Map([
      [item.id, new PostboxDeliveryError("terminal", "postbox_message_rejected")],
    ]));

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary.failed).toBe(1);
    expect(repository.states.get(item.id)?.state).toBe("failed");
  });

  // Catches a stale worker claiming delivery after another worker recovered the lease during the provider call.
  it("reports a lost lease without overwriting the current owner state", async () => {
    const item = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification");
    const repository = new InMemoryDeliveryRepository([item], "lease_lost");
    const sender = new CapturingSender();

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary).toEqual({ leased: 1, delivered: 0, rescheduled: 0, failed: 0, leaseLost: 1 });
    expect(repository.states.get(item.id)?.state).toBe("leased");
    expect(sender.prepared).toHaveLength(1);
    expect(sender.sent).toHaveLength(0);
    expect(sender.discarded).toBe(1);
  });

  // Catches a sent-message loss where a database write failure is mistaken for a terminal content error.
  it("propagates a delivered-state storage failure instead of marking the sent job failed", async () => {
    const item = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification");
    let failedTransitions = 0;
    const repository: OutboxDeliveryRepository = {
      leaseDue: async () => [item],
      beginDeliveryAttempt: async () => ({ status: "started", deliveryAttemptCount: 1 }),
      markDelivered: async () => Promise.reject(new Error("database_unavailable")),
      reschedule: async () => "updated",
      markFailed: async () => {
        failedTransitions += 1;
        return "updated";
      },
    };

    await expect(drainWith(repository, new CapturingSender())({
      limit: 1,
      workerId: "worker-a",
    })).rejects.toThrow("database_unavailable");
    expect(failedTransitions).toBe(0);
  });

  // Catches a wrong but correctly-sized deployment key irreversibly erasing recoverable ciphertext.
  it("reschedules decryption failure without consuming provider budget or sending", async () => {
    const item = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification");
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender();
    const wrongKey = Buffer.alloc(32, 0xff);
    const drain = createDrainOutbox({
      repository,
      sender,
      encryptionKey: wrongKey,
      now: () => now,
    });

    const summary = await drain({ limit: 1, workerId: "worker-a" });

    expect(summary).toEqual({ leased: 1, delivered: 0, rescheduled: 1, failed: 0, leaseLost: 0 });
    expect(repository.states.get(item.id)?.state).toBe("rescheduled");
    expect(repository.deliveryAttempts.get(item.id)).toBe(0);
    expect(sender.prepared).toHaveLength(0);
    expect(sender.sent).toHaveLength(0);
  });

  // Catches a legal revision/configuration change destroying authenticated historical submissions.
  it("reschedules authenticated consent drift without consuming provider budget", async () => {
    const item = job(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "notification",
      { ...durableTelegram, consentId: "VBT-PD-02/2026.07/01" },
    );
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender();

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary.rescheduled).toBe(1);
    expect(repository.deliveryAttempts.get(item.id)).toBe(0);
    expect(sender.sent).toHaveLength(0);
  });

  // Catches renderer/runtime defects being mislabeled as decryption poison and erasing the payload.
  it("reschedules renderer failure without provider budget and reports the render stage", async () => {
    const item = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification");
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender();
    const events: TelemetryEvent[] = [];

    const summary = await drainWith(repository, sender, {
      renderNotification: async () => Promise.reject(new Error("renderer_runtime_failed")),
      telemetry: { emit: (event: TelemetryEvent) => events.push(event) },
    })({ limit: 1, workerId: "worker-a" });

    expect(summary.rescheduled).toBe(1);
    expect(repository.states.get(item.id)?.state).toBe("rescheduled");
    expect(repository.deliveryAttempts.get(item.id)).toBe(0);
    expect(sender.prepared).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ stage: "render", status: "rescheduled" });
  });

  // Catches missing IAM/configuration consuming a provider attempt before any network request exists.
  it("reschedules token preparation failure without consuming provider budget", async () => {
    const item = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "notification");
    const repository = new InMemoryDeliveryRepository([item]);
    const sender = new CapturingSender(
      new Map(),
      new PostboxDeliveryError("transient", "postbox_auth_unavailable"),
    );

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary.rescheduled).toBe(1);
    expect(repository.deliveryAttempts.get(item.id)).toBe(0);
    expect(sender.prepared).toHaveLength(1);
    expect(sender.sent).toHaveLength(0);
  });

  // Catches corrupt encrypted/durable payloads reaching the provider boundary.
  it("fails an invalid durable payload terminally without rendering or sending it", async () => {
    const invalid = job(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "notification",
      { ...durableTelegram, contact: "NOT AN ADDRESS" },
    );
    const repository = new InMemoryDeliveryRepository([invalid]);
    const sender = new CapturingSender();

    const summary = await drainWith(repository, sender)({ limit: 1, workerId: "worker-a" });

    expect(summary.failed).toBe(1);
    expect(repository.deliveryAttempts.get(invalid.id)).toBe(0);
    expect(sender.sent).toHaveLength(0);
  });
});
