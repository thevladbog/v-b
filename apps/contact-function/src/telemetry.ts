export const TELEMETRY_EVENT_KINDS = [
  "contact_delivery",
  "contact_retention",
  "contact_timer",
] as const;
export const TELEMETRY_STAGES = [
  "lease",
  "decrypt",
  "render",
  "provider",
  "state",
  "retention",
  "timer",
] as const;
export const TELEMETRY_STATUSES = [
  "started",
  "delivered",
  "rescheduled",
  "failed",
  "lease_lost",
  "completed",
] as const;

export interface TelemetryEvent {
  eventKind: (typeof TELEMETRY_EVENT_KINDS)[number];
  requestId?: string;
  stage: (typeof TELEMETRY_STAGES)[number];
  status: (typeof TELEMETRY_STATUSES)[number];
  latencyMs: number;
}

export interface ContactTelemetry {
  emit(event: TelemetryEvent): void;
}

const inSet = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.includes(value as T);

const assertEvent = (event: TelemetryEvent): void => {
  if (
    !event ||
    !inSet(event.eventKind, TELEMETRY_EVENT_KINDS) ||
    !inSet(event.stage, TELEMETRY_STAGES) ||
    !inSet(event.status, TELEMETRY_STATUSES) ||
    (event.requestId !== undefined &&
      (typeof event.requestId !== "string" ||
        event.requestId.length < 1 ||
        event.requestId.length > 128 ||
        /\p{Cc}/u.test(event.requestId))) ||
    !Number.isSafeInteger(event.latencyMs) ||
    event.latencyMs < 0 ||
    event.latencyMs > 86_400_000
  ) {
    throw new Error("invalid_telemetry_event");
  }
};

export const createJsonTelemetry = (
  write: (line: string) => void = (line) => console.info(line),
): ContactTelemetry => ({
  emit(event) {
    assertEvent(event);
    write(JSON.stringify({
      eventKind: event.eventKind,
      ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
      stage: event.stage,
      status: event.status,
      latencyMs: event.latencyMs,
    }));
  },
});

export const silentTelemetry: ContactTelemetry = { emit: () => undefined };
