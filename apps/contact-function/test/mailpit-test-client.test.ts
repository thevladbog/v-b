import { afterEach, describe, expect, it } from "vitest";
import {
  connectDedicatedMailpit,
  requireLocalE2EConfig,
} from "./mailpit-test-client.js";

const previousUrl = process.env.VBTECH_MAILPIT_API_URL;

afterEach(() => {
  if (previousUrl === undefined) delete process.env.VBTECH_MAILPIT_API_URL;
  else process.env.VBTECH_MAILPIT_API_URL = previousUrl;
});

describe("Task 7 Mailpit safety boundary", () => {
  it("rejects a loopback Mailpit origin outside the dedicated Task 7 port", () => {
    // Break caught: an arbitrary loopback mailbox passes the guard and can be mutated by Task 7 cleanup.
    process.env.VBTECH_MAILPIT_API_URL = "http://127.0.0.1:58026";
    expect(() => requireLocalE2EConfig()).toThrow(
      "VBTECH_MAILPIT_API_URL must be exactly http://127.0.0.1:58025/",
    );
  });

  it("rejects a localhost alias instead of the dedicated numeric origin", () => {
    // Break caught: localhost may resolve to a different local service than the reviewed Compose binding.
    process.env.VBTECH_MAILPIT_API_URL = "http://localhost:58025";
    expect(() => requireLocalE2EConfig()).toThrow(
      "VBTECH_MAILPIT_API_URL must be exactly http://127.0.0.1:58025/",
    );
  });

  it("fails closed when the exact local Mailpit does not expose the Task 7 marker", async () => {
    // Break caught: exact port alone is treated as ownership proof and permits mutation of a different service instance.
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
      ChaosEnabled: false,
      DuplicatesIgnored: false,
      HideDeleteAllButton: false,
      Label: "another-local-mailbox",
      MessageRelay: {
        AllowedRecipients: "",
        BlockedRecipients: "",
        Enabled: false,
        OverrideFrom: "",
        PreserveMessageIDs: false,
        ReturnPath: "",
        SMTPServer: "",
      },
      SpamAssassin: false,
    }), { status: 200, headers: { "content-type": "application/json" } });
    await expect(connectDedicatedMailpit(
      new URL("http://127.0.0.1:58025/"),
      fetchImpl,
    )).rejects.toThrow("mailpit_task7_marker_mismatch");
  });
});
