import { expect, test as base } from "@playwright/test";

interface BrowserSignals {
  consoleWarningsAndErrors: string[];
  uncaughtPageErrors: string[];
}

export const test = base.extend<BrowserSignals>({
  consoleWarningsAndErrors: [
    async ({ page }, use, testInfo) => {
      const messages: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "warning" || message.type() === "error") {
          const location = message.location();
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
});

export { expect } from "@playwright/test";
