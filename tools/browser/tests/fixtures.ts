import { expect, test as base, type ConsoleMessage, type Request } from "@playwright/test";

const contactFixtureOrigin = "http://127.0.0.1:43219";
const contactApiUrl = `${contactFixtureOrigin}/api/contact`;
const smartCaptchaScriptUrl = "https://smartcaptcha.cloud.yandex.ru/captcha.js";

const statusConsoleMessages = new Map<number, string>([
  [400, "Failed to load resource: the server responded with a status of 400 (Bad Request)"],
  [409, "Failed to load resource: the server responded with a status of 409 (Conflict)"],
  [429, "Failed to load resource: the server responded with a status of 429 (Too Many Requests)"],
  [503, "Failed to load resource: the server responded with a status of 503 (Service Unavailable)"],
]);

const abortedRequestConsoleMessage = "Failed to load resource: net::ERR_FAILED";

class ContactFailureRegistry {
  readonly #expectedConsole = new Map<string, number>();
  readonly #expectedRequestFailures = new Map<string, number>();

  expectStatus(status: 400 | 409 | 429 | 503, count = 1) {
    const message = statusConsoleMessages.get(status);
    if (!message) throw new Error(`Unsupported fixture status ${status}`);
    this.#add(this.#expectedConsole, message, count);
  }

  expectAbort(count = 1) {
    this.#add(this.#expectedConsole, abortedRequestConsoleMessage, count);
    this.#add(this.#expectedRequestFailures, "net::ERR_FAILED", count);
  }

  consumeConsole(message: ConsoleMessage) {
    if (message.location().url !== contactApiUrl) return false;
    return this.#consume(this.#expectedConsole, message.text());
  }

  consumeRequestFailure(request: Request) {
    if (request.url() !== contactApiUrl) return false;
    return this.#consume(this.#expectedRequestFailures, request.failure()?.errorText ?? "");
  }

  remaining() {
    return {
      console: [...this.#expectedConsole.entries()],
      requestFailures: [...this.#expectedRequestFailures.entries()],
    };
  }

  #add(target: Map<string, number>, key: string, count: number) {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Expected failure count must be a positive integer");
    target.set(key, (target.get(key) ?? 0) + count);
  }

  #consume(target: Map<string, number>, key: string) {
    const count = target.get(key) ?? 0;
    if (count === 0) return false;
    if (count === 1) target.delete(key);
    else target.set(key, count - 1);
    return true;
  }
}

function isAllowedContactFixtureRequest(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.origin === contactFixtureOrigin) {
    return !url.pathname.startsWith("/api/") || url.href === contactApiUrl;
  }
  if (`${url.origin}${url.pathname}` !== smartCaptchaScriptUrl) return false;
  return url.searchParams.get("render") === "onload" &&
    /^__vbtechSmartCaptchaOnload\d+$/.test(url.searchParams.get("onload") ?? "") &&
    [...url.searchParams.keys()].every((key) => key === "render" || key === "onload");
}

interface BrowserSignals {
  consoleWarningsAndErrors: string[];
  contactFailures: ContactFailureRegistry;
  uncaughtPageErrors: string[];
  unexpectedContactRequests: string[];
  unexpectedRequestFailures: string[];
}

export const test = base.extend<BrowserSignals>({
  contactFailures: async ({}, use, testInfo) => {
    const registry = new ContactFailureRegistry();
    await use(registry);
    if (!testInfo.file.endsWith("contact.spec.ts")) return;
    expect(registry.remaining(), "Every registered contact failure must be observed exactly").toEqual({
      console: [],
      requestFailures: [],
    });
  },
  consoleWarningsAndErrors: [
    async ({ page, contactFailures }, use, testInfo) => {
      const messages: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "warning" || message.type() === "error") {
          const location = message.location();
          const expectedContactFixtureFailure = testInfo.file.endsWith("contact.spec.ts") &&
            contactFailures.consumeConsole(message);
          if (expectedContactFixtureFailure) return;
          messages.push(
            `[${message.type()}] ${message.text()}${location.url ? ` (${location.url}:${location.lineNumber})` : ""}`,
          );
        }
      });

      await use(messages);

      if (messages.length > 0) {
        await testInfo.attach("console-warnings-and-errors", {
          body: messages.join("\n"),
          contentType: "text/plain",
        });
      }
      expect(messages, `Unexpected browser console output:\n${messages.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
  uncaughtPageErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.stack ?? error.message));

      await use(errors);

      if (errors.length > 0) {
        await testInfo.attach("uncaught-page-errors", {
          body: errors.join("\n\n"),
          contentType: "text/plain",
        });
      }
      expect(errors, `Unexpected uncaught page errors:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
  unexpectedContactRequests: [
    async ({ page }, use, testInfo) => {
      const requests: string[] = [];
      if (testInfo.file.endsWith("contact.spec.ts")) {
        page.on("request", (request) => {
          if (!isAllowedContactFixtureRequest(request.url())) requests.push(request.url());
        });
      }
      await use(requests);
      expect(requests, `Unexpected contact fixture requests:\n${requests.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
  unexpectedRequestFailures: [
    async ({ page, contactFailures }, use, testInfo) => {
      const failures: string[] = [];
      if (testInfo.file.endsWith("contact.spec.ts")) {
        page.on("requestfailed", (request) => {
          if (!contactFailures.consumeRequestFailure(request)) {
            failures.push(`${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`);
          }
        });
      }
      await use(failures);
      expect(failures, `Unexpected request failures:\n${failures.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
