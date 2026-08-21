import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  contactRequestSchema,
  isEmailContact,
  type ContactRequest,
} from "@vbtech/contracts";
import { CURRENT_CONTACT_CONSENT_ID } from "@vbtech/legal-documents";
import type { PoolClient } from "pg";
import {
  encryptPayload,
  type DeliveryKind,
  type EncryptedPayload,
} from "./crypto.js";
import type { ContactDatabasePool } from "./db.js";

export type AcceptResult = "created" | "existing";
export type StateUpdateResult = "updated" | "lease_lost";
export type BeginDeliveryAttemptResult =
  | { status: "started"; deliveryAttemptCount: number }
  | { status: "already_started"; deliveryAttemptCount: number }
  | { status: "attempts_exhausted" }
  | { status: "lease_lost" };

export interface LeasedOutboxJob {
  id: string;
  publicRequestId: string;
  kind: DeliveryKind;
  encryptedPayload: EncryptedPayload;
  attemptCount: number;
  deliveryAttemptCount: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  createdAt: Date;
}

export interface OutboxLeaseRepository {
  leaseDue(limit: number, workerId: string): Promise<LeasedOutboxJob[]>;
  beginDeliveryAttempt(
    jobId: string,
    workerId: string,
    attemptCount: number,
  ): Promise<BeginDeliveryAttemptResult>;
  markDelivered(
    jobId: string,
    workerId: string,
    attemptCount: number,
    providerMessageId: string,
  ): Promise<StateUpdateResult>;
  reschedule(
    jobId: string,
    workerId: string,
    attemptCount: number,
    nextAttemptAt: Date,
  ): Promise<StateUpdateResult>;
  markFailed(
    jobId: string,
    workerId: string,
    attemptCount: number,
  ): Promise<StateUpdateResult>;
}

export type OutboxDeliveryRepository = OutboxLeaseRepository;

interface DurableContactRequest {
  locale: ContactRequest["locale"];
  name: string;
  contact: string;
  message: string;
  sourcePath: ContactRequest["sourcePath"];
  consentId: string;
}

interface StoredRequestRow {
  content_hash: Buffer;
}

interface LeasedRow {
  id: string;
  public_request_id: string;
  kind: DeliveryKind;
  payload_ciphertext: Buffer;
  payload_iv: Buffer;
  payload_auth_tag: Buffer;
  attempt_count: number;
  delivery_attempt_count: number;
  lease_owner: string;
  lease_expires_at: Date;
  created_at: Date;
}

const MAX_LEASE_BATCH = 100;
const MAX_DELIVERY_ATTEMPTS = 5;
const LEASE_DURATION_MILLISECONDS = 60_000;

const durableRequest = (request: ContactRequest): DurableContactRequest => ({
  locale: request.locale,
  name: request.name,
  contact: request.contact,
  message: request.message,
  sourcePath: request.sourcePath,
  consentId: request.consentId,
});

const durableHash = (request: DurableContactRequest): Buffer =>
  createHash("sha256").update(JSON.stringify(request), "utf8").digest();

const hashesMatch = (left: Buffer, right: Buffer): boolean =>
  left.length === right.length && timingSafeEqual(left, right);

const deliveryKinds = (contact: string): DeliveryKind[] =>
  isEmailContact(contact)
    ? ["notification", "confirmation"]
    : ["notification"];

const assertLeaseInput = (limit: number, workerId: string): void => {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LEASE_BATCH) {
    throw new Error("invalid_lease_limit");
  }
  if (
    workerId.length < 1 ||
    workerId.length > 128 ||
    /\p{Cc}/u.test(workerId)
  ) {
    throw new Error("invalid_worker_id");
  }
};

const rollback = async (client: PoolClient): Promise<void> => {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The original failure remains the actionable error and contains no visitor content.
  }
};

export class OutboxRepository implements OutboxLeaseRepository {
  constructor(
    private readonly pool: ContactDatabasePool,
    private readonly encryptionKey: Buffer,
  ) {
    if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
      throw new Error("invalid_encryption_key");
    }
  }

  async accept(input: ContactRequest): Promise<AcceptResult> {
    const request = contactRequestSchema.parse(input);
    if (request.consentId !== CURRENT_CONTACT_CONSENT_ID) {
      throw new Error("consent_revision_changed");
    }
    const durable = durableRequest(request);
    const contentHash = durableHash(durable);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [request.requestId],
      );

      const stored = await client.query<StoredRequestRow>(
        "SELECT content_hash FROM contact_requests WHERE public_request_id = $1",
        [request.requestId],
      );
      const existingHash = stored.rows[0]?.content_hash;
      if (existingHash) {
        if (!hashesMatch(existingHash, contentHash)) {
          throw new Error("request_id_reused");
        }
        await client.query("COMMIT");
        return "existing";
      }

      await client.query(
        "INSERT INTO contact_requests (public_request_id, content_hash) VALUES ($1, $2)",
        [request.requestId, contentHash],
      );

      for (const kind of deliveryKinds(durable.contact)) {
        const encrypted = encryptPayload(durable, this.encryptionKey, {
          requestId: request.requestId,
          kind,
        });
        await client.query(
          `INSERT INTO email_outbox (
             public_request_id,
             kind,
             payload_ciphertext,
             payload_iv,
             payload_auth_tag
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            request.requestId,
            kind,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.authTag,
          ],
        );
      }

      await client.query("COMMIT");
      return "created";
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async leaseDue(limit: number, workerId: string): Promise<LeasedOutboxJob[]> {
    assertLeaseInput(limit, workerId);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const leased = await client.query<LeasedRow>(
        `WITH due AS (
           SELECT id
           FROM email_outbox
           WHERE delivered_at IS NULL
             AND failed_at IS NULL
             AND next_attempt_at <= clock_timestamp()
             AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
           ORDER BY next_attempt_at, created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE email_outbox AS job
         SET lease_owner = $2,
             lease_expires_at = clock_timestamp() + ($3 * interval '1 millisecond'),
             attempt_count = job.attempt_count + 1
         FROM due
         WHERE job.id = due.id
         RETURNING
           job.id::text,
           job.public_request_id::text,
           job.kind,
           job.payload_ciphertext,
           job.payload_iv,
           job.payload_auth_tag,
           job.attempt_count,
           job.delivery_attempt_count,
           job.lease_owner,
           job.lease_expires_at,
           job.created_at`,
        [limit, workerId, LEASE_DURATION_MILLISECONDS],
      );
      await client.query("COMMIT");

      return leased.rows.map((row) => ({
        id: row.id,
        publicRequestId: row.public_request_id,
        kind: row.kind,
        encryptedPayload: {
          ciphertext: row.payload_ciphertext,
          iv: row.payload_iv,
          authTag: row.payload_auth_tag,
        },
        attemptCount: row.attempt_count,
        deliveryAttemptCount: row.delivery_attempt_count,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: row.lease_expires_at,
        createdAt: row.created_at,
      }));
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async beginDeliveryAttempt(
    jobId: string,
    workerId: string,
    attemptCount: number,
  ): Promise<BeginDeliveryAttemptResult> {
    assertLeaseInput(1, workerId);
    if (!Number.isInteger(attemptCount) || attemptCount < 1) {
      throw new Error("invalid_lease_fence");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{
        delivery_attempt_count: number;
        delivery_attempt_generation: number;
      }>(
        `SELECT delivery_attempt_count, delivery_attempt_generation
         FROM email_outbox
         WHERE id = $1
           AND lease_owner = $2
           AND attempt_count = $3
           AND lease_expires_at > clock_timestamp()
           AND delivered_at IS NULL
           AND failed_at IS NULL
         FOR UPDATE`,
        [jobId, workerId, attemptCount],
      );
      const row = selected.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return { status: "lease_lost" };
      }
      if (row.delivery_attempt_generation === attemptCount) {
        await client.query("COMMIT");
        return {
          status: "already_started",
          deliveryAttemptCount: row.delivery_attempt_count,
        };
      }
      if (row.delivery_attempt_count >= MAX_DELIVERY_ATTEMPTS) {
        await client.query("COMMIT");
        return { status: "attempts_exhausted" };
      }

      const deliveryAttemptCount = row.delivery_attempt_count + 1;
      const updated = await client.query(
        `UPDATE email_outbox
         SET delivery_attempt_count = $4,
             delivery_attempt_generation = $3
         WHERE id = $1
           AND lease_owner = $2
           AND attempt_count = $3
           AND lease_expires_at > clock_timestamp()
           AND delivered_at IS NULL
           AND failed_at IS NULL`,
        [jobId, workerId, attemptCount, deliveryAttemptCount],
      );
      if (updated.rowCount !== 1) {
        await client.query("COMMIT");
        return { status: "lease_lost" };
      }
      await client.query("COMMIT");
      return { status: "started", deliveryAttemptCount };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async markDelivered(
    jobId: string,
    workerId: string,
    attemptCount: number,
    providerMessageId: string,
  ): Promise<StateUpdateResult> {
    if (
      providerMessageId.length < 1 ||
      providerMessageId.length > 512 ||
      /\p{Cc}/u.test(providerMessageId)
    ) {
      throw new Error("invalid_provider_message_id");
    }
    return this.updateOwnedLease(
      jobId,
      workerId,
      attemptCount,
      `delivered_at = clock_timestamp(),
       provider_message_id = $4,
       payload_ciphertext = NULL,
       payload_iv = NULL,
       payload_auth_tag = NULL,
       lease_owner = NULL,
       lease_expires_at = NULL`,
      [providerMessageId],
    );
  }

  async reschedule(
    jobId: string,
    workerId: string,
    attemptCount: number,
    nextAttemptAt: Date,
  ): Promise<StateUpdateResult> {
    if (Number.isNaN(nextAttemptAt.getTime())) {
      throw new Error("invalid_next_attempt_at");
    }
    return this.updateOwnedLease(
      jobId,
      workerId,
      attemptCount,
      `next_attempt_at = $4,
       lease_owner = NULL,
       lease_expires_at = NULL`,
      [nextAttemptAt],
    );
  }

  async markFailed(
    jobId: string,
    workerId: string,
    attemptCount: number,
  ): Promise<StateUpdateResult> {
    return this.updateOwnedLease(
      jobId,
      workerId,
      attemptCount,
      `failed_at = clock_timestamp(),
       payload_ciphertext = NULL,
       payload_iv = NULL,
       payload_auth_tag = NULL,
       lease_owner = NULL,
       lease_expires_at = NULL`,
    );
  }

  private async updateOwnedLease(
    jobId: string,
    workerId: string,
    attemptCount: number,
    assignment: string,
    values: unknown[] = [],
  ): Promise<StateUpdateResult> {
    assertLeaseInput(1, workerId);
    if (!Number.isInteger(attemptCount) || attemptCount < 1) {
      throw new Error("invalid_lease_fence");
    }
    const result = await this.pool.connect();
    try {
      const updated = await result.query(
        `UPDATE email_outbox
         SET ${assignment}
         WHERE id = $1
           AND lease_owner = $2
           AND attempt_count = $3
           AND lease_expires_at > clock_timestamp()
           AND delivered_at IS NULL
           AND failed_at IS NULL`,
        [jobId, workerId, attemptCount, ...values],
      );
      return updated.rowCount === 1 ? "updated" : "lease_lost";
    } finally {
      result.release();
    }
  }
}
