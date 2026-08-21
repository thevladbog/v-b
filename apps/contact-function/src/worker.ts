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
  LeasedOutboxJob,
  OutboxDeliveryRepository,
  StateUpdateResult,
} from "./outbox-repository.js";
import {
  PostboxDeliveryError,
  POSTBOX_SENDER,
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
}

const emptySummary = (leased: number): DrainSummary => ({
  leased,
  delivered: 0,
  rescheduled: 0,
  failed: 0,
  leaseLost: 0,
});

const parseDurablePayload = (job: LeasedOutboxJob, key: Buffer): ContactRequest => {
  const durable = decryptPayload<DurableContactPayload>(job.encryptedPayload, key, {
    requestId: job.publicRequestId,
    kind: job.kind,
  });
  const request = contactRequestSchema.parse({
    ...durable,
    requestId: job.publicRequestId,
    captchaToken: "worker-payload-validation",
    website: "",
  });
  if (request.consentId !== CURRENT_CONTACT_CONSENT_ID) {
    throw new Error("consent_revision_changed");
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
): Promise<RenderedEmail> => job.kind === "notification"
  ? renderContactNotification(emailInput(job, request))
  : renderContactConfirmation(emailInput(job, request));

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

export const createDrainOutbox = ({
  repository,
  sender,
  encryptionKey,
  now = () => new Date(),
  telemetry = silentTelemetry,
}: OutboxWorkerDependencies): DrainOutbox => {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
    throw new Error("invalid_encryption_key");
  }

  return async ({ limit, workerId }) => {
    const jobs = await repository.leaseDue(limit, workerId);
    const summary = emptySummary(jobs.length);

    for (const job of jobs) {
      const startedAt = Date.now();
      if (job.attemptCount > MAX_DELIVERY_ATTEMPTS) {
        const result = await repository.markFailed(job.id, workerId, job.attemptCount);
        const state = applyStateResult(result, summary, "failed");
        safeEmit(telemetry, {
          eventKind: "contact_delivery",
          requestId: job.publicRequestId,
          stage: "state",
          status: state === "lease_lost" ? "lease_lost" : "failed",
          latencyMs: Math.max(0, Date.now() - startedAt),
        });
        continue;
      }
      let providerMessageId: string;
      try {
        const request = parseDurablePayload(job, encryptionKey);
        const rendered = await renderJob(job, request);
        const sent = await sender.send(providerInput(job, request, rendered));
        providerMessageId = sent.providerMessageId;
      } catch (error) {
        const retryable = error instanceof PostboxDeliveryError &&
          error.disposition === "transient" &&
          job.attemptCount < MAX_DELIVERY_ATTEMPTS;
        const result = retryable
          ? await repository.reschedule(
            job.id,
            workerId,
            job.attemptCount,
            new Date(now().getTime() + RETRY_DELAYS_MILLISECONDS[job.attemptCount - 1]!),
          )
          : await repository.markFailed(job.id, workerId, job.attemptCount);
        const state = applyStateResult(
          result,
          summary,
          retryable ? "rescheduled" : "failed",
        );
        safeEmit(telemetry, {
          eventKind: "contact_delivery",
          requestId: job.publicRequestId,
          stage: error instanceof PostboxDeliveryError ? "provider" : "decrypt",
          status: state === "lease_lost"
            ? "lease_lost"
            : retryable ? "rescheduled" : "failed",
          latencyMs: Math.max(0, Date.now() - startedAt),
        });
        continue;
      }

      const state = await repository.markDelivered(
        job.id,
        workerId,
        job.attemptCount,
        providerMessageId,
      );
      const status = applyStateResult(state, summary, "delivered");
      safeEmit(telemetry, {
        eventKind: "contact_delivery",
        requestId: job.publicRequestId,
        stage: "state",
        status: status === "updated" ? "delivered" : "lease_lost",
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
    }

    return summary;
  };
};
