import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  contactRequestSchema,
  isEmailContact,
  type ContactRequest,
} from "@vbtech/contracts";
import type { PoolClient } from "pg";
import {
  encryptPayload,
  type DeliveryKind,
  type EncryptedPayload,
} from "./crypto.js";
import type { ContactDatabasePool } from "./db.js";

export type AcceptResult = "created" | "existing";
export type StateUpdateResult = "updated" | "lease_lost";

export interface LeasedOutboxJob {
  id: string;
  publicRequestId: string;
  kind: DeliveryKind;
  encryptedPayload: EncryptedPayload;
  attemptCount: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  createdAt: Date;
}

export interface OutboxLeaseRepository {
  leaseDue(limit: number, workerId: string): Promise<LeasedOutboxJob[]>;
  markDelivered(jobId: string, workerId: string): Promise<StateUpdateResult>;
  reschedule(
    jobId: string,
    workerId: string,
    nextAttemptAt: Date,
  ): Promise<StateUpdateResult>;
  markFailed(jobId: string, workerId: string): Promise<StateUpdateResult>;
}

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
  lease_owner: string;
  lease_expires_at: Date;
  created_at: Date;
}

const MAX_LEASE_BATCH = 100;
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

  async markDelivered(
    jobId: string,
    workerId: string,
  ): Promise<StateUpdateResult> {
    return this.updateOwnedLease(
      jobId,
      workerId,
      `delivered_at = clock_timestamp(),
       lease_owner = NULL,
       lease_expires_at = NULL`,
    );
  }

  async reschedule(
    jobId: string,
    workerId: string,
    nextAttemptAt: Date,
  ): Promise<StateUpdateResult> {
    if (Number.isNaN(nextAttemptAt.getTime())) {
      throw new Error("invalid_next_attempt_at");
    }
    return this.updateOwnedLease(
      jobId,
      workerId,
      `next_attempt_at = $3,
       lease_owner = NULL,
       lease_expires_at = NULL`,
      nextAttemptAt,
    );
  }

  async markFailed(jobId: string, workerId: string): Promise<StateUpdateResult> {
    return this.updateOwnedLease(
      jobId,
      workerId,
      `failed_at = clock_timestamp(),
       lease_owner = NULL,
       lease_expires_at = NULL`,
    );
  }

  private async updateOwnedLease(
    jobId: string,
    workerId: string,
    assignment: string,
    value?: Date,
  ): Promise<StateUpdateResult> {
    assertLeaseInput(1, workerId);
    const result = await this.pool.connect();
    try {
      const updated = await result.query(
        `UPDATE email_outbox
         SET ${assignment}
         WHERE id = $1
           AND lease_owner = $2
           AND lease_expires_at > clock_timestamp()
           AND delivered_at IS NULL
           AND failed_at IS NULL`,
        value === undefined ? [jobId, workerId] : [jobId, workerId, value],
      );
      return updated.rowCount === 1 ? "updated" : "lease_lost";
    } finally {
      result.release();
    }
  }
}
