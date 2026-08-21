import { Pool } from "pg";
import { loadContactWorkerConfig } from "./config.js";
import { OutboxRepository } from "./outbox-repository.js";
import { YandexPostbox } from "./postbox.js";
import {
  PostgresOutboxRetention,
  runContactRetention,
  type RetentionSummary,
} from "./retention.js";
import { createJsonTelemetry } from "./telemetry.js";
import { createDrainOutbox, type DrainOutbox } from "./worker.js";

const TIMER_EVENT_TYPE = "yandex.cloud.events.serverless.triggers.TimerMessage";
const DELIVERY_BATCH_SIZE = 25;
const MAX_CONTEXT_TOKEN_LENGTH = 8_192;

export interface YandexTimerEvent {
  messages: Array<{
    event_metadata: {
      event_id: string;
      event_type: typeof TIMER_EVENT_TYPE;
      created_at: string;
      cloud_id: string;
      folder_id: string;
    };
    details: {
      trigger_id: string;
      payload: string;
    };
  }>;
}

export interface YandexFunctionContext {
  requestId?: string;
  token?: {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };
}

export interface TimerRuntime {
  drainOutbox: DrainOutbox;
  runRetention(referenceTime: Date): Promise<RetentionSummary>;
  close(): Promise<void>;
}

export interface TimerRuntimeFactoryInput {
  getIamToken: () => Promise<string>;
}

export interface CreateTimerHandlerOptions {
  createRuntime: (input: TimerRuntimeFactoryInput) => Promise<TimerRuntime>;
  now?: () => Date;
}

export interface TimerHandlerResult {
  statusCode: 204;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: string[]): boolean => {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const safeString = (value: unknown, maximum = 256): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= maximum &&
  !/\p{Cc}/u.test(value);

const parseTimerEvent = (event: unknown): YandexTimerEvent => {
  if (!isRecord(event) || !hasExactKeys(event, ["messages"])) {
    throw new Error("invalid_timer_event");
  }
  const messages = event.messages;
  if (!Array.isArray(messages) || messages.length !== 1 || !isRecord(messages[0])) {
    throw new Error("invalid_timer_event");
  }
  const message = messages[0];
  if (!hasExactKeys(message, ["event_metadata", "details"])) {
    throw new Error("invalid_timer_event");
  }
  const metadata = message.event_metadata;
  const details = message.details;
  if (
    !isRecord(metadata) ||
    !hasExactKeys(metadata, ["event_id", "event_type", "created_at", "cloud_id", "folder_id"]) ||
    !safeString(metadata.event_id) ||
    metadata.event_type !== TIMER_EVENT_TYPE ||
    !safeString(metadata.created_at) ||
    Number.isNaN(Date.parse(metadata.created_at)) ||
    !safeString(metadata.cloud_id) ||
    !safeString(metadata.folder_id) ||
    !isRecord(details) ||
    !hasExactKeys(details, ["trigger_id", "payload"]) ||
    !safeString(details.trigger_id) ||
    !safeString(details.payload, 4_096)
  ) {
    throw new Error("invalid_timer_event");
  }
  return event as unknown as YandexTimerEvent;
};

const readIamToken = (context: unknown): string => {
  if (!isRecord(context)) {
    throw new Error("invalid_timer_context");
  }
  const tokenContext = context.token;
  if (!isRecord(tokenContext)) {
    throw new Error("invalid_timer_context");
  }
  const token = tokenContext.access_token;
  if (
    typeof token !== "string" ||
    token.length < 1 ||
    token.length > MAX_CONTEXT_TOKEN_LENGTH ||
    /\p{Cc}/u.test(token)
  ) {
    throw new Error("invalid_timer_context");
  }
  return token;
};

const readWorkerId = (context: unknown): string => {
  if (!isRecord(context) || !safeString(context.requestId, 122)) {
    throw new Error("invalid_timer_context");
  }
  return `timer-${context.requestId}`;
};

const createProductionRuntime = async ({
  getIamToken,
}: TimerRuntimeFactoryInput): Promise<TimerRuntime> => {
  const config = loadContactWorkerConfig();
  const pool = new Pool({ connectionString: config.databaseUrl, max: 4 });
  const repository = new OutboxRepository(pool, config.outboxEncryptionKey);
  const retention = new PostgresOutboxRetention(pool);
  const sender = new YandexPostbox({ getIamToken });
  const drainOutbox = createDrainOutbox({
    repository,
    sender,
    encryptionKey: config.outboxEncryptionKey,
    telemetry: createJsonTelemetry(),
  });

  return {
    drainOutbox,
    runRetention: (referenceTime) => runContactRetention({ repository: retention, referenceTime }),
    close: () => pool.end(),
  };
};

export const createTimerHandler = ({
  createRuntime,
  now = () => new Date(),
}: CreateTimerHandlerOptions) => async (
  event: unknown,
  context: unknown,
): Promise<TimerHandlerResult> => {
  parseTimerEvent(event);
  readIamToken(context);
  const workerId = readWorkerId(context);
  const getIamToken = async (): Promise<string> => readIamToken(context);
  const runtime = await createRuntime({ getIamToken });
  try {
    const referenceTime = now();
    if (Number.isNaN(referenceTime.getTime())) throw new Error("invalid_timer_clock");
    await runtime.drainOutbox({ limit: DELIVERY_BATCH_SIZE, workerId });
    await runtime.runRetention(referenceTime);
    return { statusCode: 204 };
  } finally {
    await runtime.close();
  }
};

export const timerHandler = createTimerHandler({
  createRuntime: createProductionRuntime,
});
