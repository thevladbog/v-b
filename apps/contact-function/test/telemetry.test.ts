import { describe, expect, it } from "vitest";
import { createJsonTelemetry } from "../src/telemetry.js";

describe("contact telemetry", () => {
  // Catches a privacy break that forwards visitor content, secrets, MIME, or provider bodies to operational logs.
  it("serializes only the approved bounded delivery fields", () => {
    const lines: string[] = [];
    const telemetry = createJsonTelemetry((line) => lines.push(line));

    telemetry.emit({
      eventKind: "contact_delivery",
      requestId: "11111111-1111-4111-8111-111111111111",
      stage: "provider",
      status: "delivered",
      latencyMs: 42,
      name: "Visitor",
      token: "secret",
      mime: "message body",
    } as never);

    expect(lines).toEqual([
      JSON.stringify({
        eventKind: "contact_delivery",
        requestId: "11111111-1111-4111-8111-111111111111",
        stage: "provider",
        status: "delivered",
        latencyMs: 42,
      }),
    ]);
  });

  // Catches log forging and unbounded telemetry values before they reach the writer.
  it("rejects controls, unknown states, and out-of-range latency", () => {
    const telemetry = createJsonTelemetry(() => undefined);

    expect(() => telemetry.emit({
      eventKind: "contact_delivery",
      requestId: "bad\nrequest",
      stage: "provider",
      status: "delivered",
      latencyMs: 1,
    })).toThrow("invalid_telemetry_event");
    expect(() => telemetry.emit({
      eventKind: "contact_delivery",
      requestId: "11111111-1111-4111-8111-111111111111",
      stage: "provider",
      status: "delivered",
      latencyMs: -1,
    })).toThrow("invalid_telemetry_event");
    expect(() => telemetry.emit({
      eventKind: "contact_delivery",
      requestId: 42,
      stage: "provider",
      status: "delivered",
      latencyMs: 1,
    } as never)).toThrow("invalid_telemetry_event");
  });
});
