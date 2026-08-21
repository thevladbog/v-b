import { Buffer } from "node:buffer";
import {
  contactRequestSchema,
  isEmailContact,
  type ContactRequest,
} from "@vbtech/contracts";
import {
  renderContactConfirmation,
  renderContactNotification,
  type ContactEmailInput,
  type RenderedEmail,
} from "@vbtech/email";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import { decryptPayload } from "./crypto.js";
import type {
  BeginDeliveryAttemptResult,
  LeasedOutboxJob,
  OutboxDeliveryRepository,
  StateUpdateResult,
} from "./outbox-repository.js";
import {
  PostboxDeliveryError,
  POSTBOX_SENDER,
  type PreparedPostboxDelivery,
  type PostboxSendInput,
  type PostboxSender,
} from "./postbox.js";
import {
  silentTelemetry,
  type ContactTelemetry,
  type TelemetryEvent,
} from "./telemetry.js";

const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_DELAYS_MILLISECONDS = [60_000, 300_000, 900_000, 3_600_000] as const;

interface DurableContactPayload {
  locale: ContactRequest["locale"];
  name: string;
  contact: string;
  message: string;
  sourcePath: ContactRequest["sourcePath"];
  consentId: string;
}

class ConsentRevisionError extends Error {
  readonly name = "ConsentRevisionError";
}

export interface DrainOptions {
  limit: number;
  workerId: string;
}

export interface DrainSummary {
  leased: number;
  delivered: number;
  rescheduled: number;
  failed: number;
  leaseLost: number;
}

export type DrainOutbox = (options: DrainOptions) => Promise<DrainSummary>;

export interface OutboxWorkerDependencies {
  repository: OutboxDeliveryRepository;
  sender: PostboxSender;
  encryptionKey: Buffer;
  now?: () => Date;
  telemetry?: ContactTelemetry;
  renderNotification?: EmailRenderer;
  renderConfirmation?: EmailRenderer;
}

export type EmailRenderer = (
  input: ContactEmailInput,
) => RenderedEmail | Promise<RenderedEmail>;

const emptySummary = (leased: number): DrainSummary => ({
  leased,
  delivered: 0,
  rescheduled: 0,
  failed: 0,
  leaseLost: 0,
});

const decryptDurablePayload = (
  job: LeasedOutboxJob,
  key: Buffer,
): DurableContactPayload => decryptPayload<DurableContactPayload>(job.encryptedPayload, key, {
    requestId: job.publicRequestId,
    kind: job.kind,
  });

const validateDurablePayload = (
  job: LeasedOutboxJob,
  durable: DurableContactPayload,
): ContactRequest => {
  const request = contactRequestSchema.parse({
    ...durable,
    requestId: job.publicRequestId,
    captchaToken: "worker-payload-validation",
    website: "",
  });
  if (request.consentId !== CURRENT_CONTACT_CONSENT_ID) {
    throw new ConsentRevisionError("consent_revision_changed");
  }
  if (job.kind === "confirmation" && !isEmailContact(request.contact)) {
    throw new Error("invalid_confirmation_contact");
  }
  return request;
};

const emailInput = (job: LeasedOutboxJob, request: ContactRequest): ContactEmailInput => ({
  locale: request.locale,
  requestId: request.requestId,
  receivedAt: job.createdAt,
  sourcePath: request.sourcePath,
  consentId: request.consentId,
  name: request.name,
  contact: request.contact,
  message: request.message,
});

const renderJob = async (
  job: LeasedOutboxJob,
  request: ContactRequest,
  renderNotification: EmailRenderer,
  renderConfirmation: EmailRenderer,
): Promise<RenderedEmail> => job.kind === "notification"
  ? renderNotification(emailInput(job, request))
  : renderConfirmation(emailInput(job, request));

const providerInput = (
  job: LeasedOutboxJob,
  request: ContactRequest,
  email: RenderedEmail,
): PostboxSendInput => ({
  outboxId: job.id,
  recipient: job.kind === "notification" ? POSTBOX_SENDER : request.contact,
  replyTo: job.kind === "notification" && isEmailContact(request.contact)
    ? request.contact
    : POSTBOX_SENDER,
  createdAt: job.createdAt,
  email,
});

const applyStateResult = (
  result: StateUpdateResult,
  summary: DrainSummary,
  updatedKey: "delivered" | "rescheduled" | "failed",
): "updated" | "lease_lost" => {
  if (result === "lease_lost") {
    summary.leaseLost += 1;
    return "lease_lost";
  }
  summary[updatedKey] += 1;
  return "updated";
};

const safeEmit = (telemetry: ContactTelemetry, event: TelemetryEvent): void => {
  try {
    telemetry.emit(event);
  } catch {
    // Delivery state must not depend on optional operational telemetry.
  }
};

const recoveryDelay = (leaseAttemptCount: number): number =>
  RETRY_DELAYS_MILLISECONDS[Math.min(
    Math.max(leaseAttemptCount, 1),
    RETRY_DELAYS_MILLISECONDS.length,
  ) - 1]!;

const providerRetryDelay = (deliveryAttemptCount: number): number =>
  RETRY_DELAYS_MILLISECONDS[deliveryAttemptCount - 1]!;

export const createDrainOutbox = ({
  repository,
  sender,
  encryptionKey,
  now = () => new Date(),
  telemetry = silentTelemetry,
  renderNotification = renderContactNotification,
  renderConfirmation = renderContactConfirmation,
}: OutboxWorkerDependencies): DrainOutbox => {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
    throw new Error("invalid_encryption_key");
  }

  return async ({ limit, workerId }) => {
    const jobs = await repository.leaseDue(limit, workerId);
    const summary = emptySummary(jobs.length);

    for (const job of jobs) {
      const startedAt = Date.now();
      const emit = (
        stage: TelemetryEvent["stage"],
        status: TelemetryEvent["status"],
      ): void => safeEmit(telemetry, {
        eventKind: "contact_delivery",
        requestId: job.publicRequestId,
        stage,
        status,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      const transition = async (
        stage: TelemetryEvent["stage"],
        terminal: boolean,
        delayMilliseconds = recoveryDelay(job.attemptCount),
      ): Promise<void> => {
        const result = terminal
          ? await repository.markFailed(job.id, workerId, job.attemptCount)
          : await repository.reschedule(
            job.id,
            workerId,
            job.attemptCount,
            new Date(now().getTime() + delayMilliseconds),
          );
        const state = applyStateResult(
          result,
          summary,
          terminal ? "failed" : "rescheduled",
        );
        emit(
          stage,
          state === "lease_lost" ? "lease_lost" : terminal ? "failed" : "rescheduled",
        );
      };

      if (job.deliveryAttemptCount >= MAX_DELIVERY_ATTEMPTS) {
        await transition("state", true);
        continue;
      }

      let durable: DurableContactPayload;
      try {
        durable = decryptDurablePayload(job, encryptionKey);
      } catch {
        await transition("decrypt", false);
        continue;
      }

      let request: ContactRequest;
      try {
        request = validateDurablePayload(job, durable);
      } catch (error) {
        if (error instanceof ConsentRevisionError) {
          await transition("decrypt", false);
        } else {
          await transition("decrypt", true);
        }
        continue;
      }

      let rendered: RenderedEmail;
      try {
        rendered = await renderJob(
          job,
          request,
          renderNotification,
          renderConfirmation,
        );
      } catch {
        await transition("render", false);
        continue;
      }

      let prepared: PreparedPostboxDelivery;
      try {
        prepared = await sender.prepare(providerInput(job, request, rendered));
      } catch (error) {
        await transition(
          "provider",
          error instanceof PostboxDeliveryError && error.disposition === "terminal",
        );
        continue;
      }

      let begun: BeginDeliveryAttemptResult;
      try {
        begun = await repository.beginDeliveryAttempt(
          job.id,
          workerId,
          job.attemptCount,
        );
      } catch (error) {
        prepared.discard();
        throw error;
      }
      if (begun.status === "lease_lost" || begun.status === "already_started") {
        prepared.discard();
        summary.leaseLost += 1;
        emit("state", "lease_lost");
        continue;
      }
      if (begun.status === "attempts_exhausted") {
        prepared.discard();
        await transition("state", true);
        continue;
      }

      let providerMessageId: string;
      try {
        const sent = await prepared.send();
        providerMessageId = sent.providerMessageId;
      } catch (error) {
        const terminal = error instanceof PostboxDeliveryError &&
          error.disposition === "terminal";
        const exhausted = begun.deliveryAttemptCount >= MAX_DELIVERY_ATTEMPTS;
        await transition(
          "provider",
          terminal || exhausted,
          exhausted
            ? recoveryDelay(job.attemptCount)
            : providerRetryDelay(begun.deliveryAttemptCount),
        );
        continue;
      }

      const state = await repository.markDelivered(
        job.id,
        workerId,
        job.attemptCount,
        providerMessageId,
      );
      const status = applyStateResult(state, summary, "delivered");
      emit("state", status === "updated" ? "delivered" : "lease_lost");
    }

    return summary;
  };
};
