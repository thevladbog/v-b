import type { PoolClient } from "pg";
import type { ContactDatabasePool } from "./db.js";

const RETENTION_BATCH_SIZE = 100;
const TERMINAL_PAYLOAD_REPAIR_AGE_MILLISECONDS = 24 * 60 * 60 * 1_000;
const TERMINAL_METADATA_AGE_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;

export interface MetadataCleanupSummary {
  outboxDeleted: number;
  requestsDeleted: number;
}

export interface RetentionSummary extends MetadataCleanupSummary {
  payloadsErased: number;
}

export interface OutboxRetentionRepository {
  eraseTerminalPayloads(cutoff: Date): Promise<number>;
  deleteTerminalMetadata(cutoff: Date): Promise<MetadataCleanupSummary>;
}

export interface RunContactRetentionOptions {
  repository: OutboxRetentionRepository;
  referenceTime: Date;
}

const assertDate = (date: Date): void => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("invalid_retention_cutoff");
  }
};

const rollback = async (client: PoolClient): Promise<void> => {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original content-free database error.
  }
};

export class PostgresOutboxRetention implements OutboxRetentionRepository {
  constructor(private readonly pool: ContactDatabasePool) {}

  async eraseTerminalPayloads(cutoff: Date): Promise<number> {
    assertDate(cutoff);
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `WITH repair AS (
           SELECT id
           FROM email_outbox
           WHERE (delivered_at IS NOT NULL OR failed_at IS NOT NULL)
             AND COALESCE(delivered_at, failed_at) <= $1
             AND payload_ciphertext IS NOT NULL
           ORDER BY COALESCE(delivered_at, failed_at), id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE email_outbox AS job
         SET payload_ciphertext = NULL,
             payload_iv = NULL,
             payload_auth_tag = NULL
         FROM repair
         WHERE job.id = repair.id`,
        [cutoff, RETENTION_BATCH_SIZE],
      );
      return result.rowCount ?? 0;
    } finally {
      client.release();
    }
  }

  async deleteTerminalMetadata(cutoff: Date): Promise<MetadataCleanupSummary> {
    assertDate(cutoff);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const outbox = await client.query(
        `WITH doomed AS (
           SELECT id
           FROM email_outbox
           WHERE (delivered_at IS NOT NULL OR failed_at IS NOT NULL)
             AND COALESCE(delivered_at, failed_at) <= $1
             AND payload_ciphertext IS NULL
           ORDER BY COALESCE(delivered_at, failed_at), id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         DELETE FROM email_outbox AS job
         USING doomed
         WHERE job.id = doomed.id`,
        [cutoff, RETENTION_BATCH_SIZE],
      );
      const requests = await client.query(
        `WITH orphaned AS (
           SELECT request.public_request_id
           FROM contact_requests AS request
           WHERE NOT EXISTS (
             SELECT 1
             FROM email_outbox AS job
             WHERE job.public_request_id = request.public_request_id
           )
           ORDER BY request.created_at, request.public_request_id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         DELETE FROM contact_requests AS request
         USING orphaned
         WHERE request.public_request_id = orphaned.public_request_id`,
        [RETENTION_BATCH_SIZE],
      );
      await client.query("COMMIT");
      return {
        outboxDeleted: outbox.rowCount ?? 0,
        requestsDeleted: requests.rowCount ?? 0,
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const runContactRetention = async ({
  repository,
  referenceTime,
}: RunContactRetentionOptions): Promise<RetentionSummary> => {
  assertDate(referenceTime);
  const payloadsErased = await repository.eraseTerminalPayloads(
    new Date(referenceTime.getTime() - TERMINAL_PAYLOAD_REPAIR_AGE_MILLISECONDS),
  );
  const metadata = await repository.deleteTerminalMetadata(
    new Date(referenceTime.getTime() - TERMINAL_METADATA_AGE_MILLISECONDS),
  );
  return { payloadsErased, ...metadata };
};
