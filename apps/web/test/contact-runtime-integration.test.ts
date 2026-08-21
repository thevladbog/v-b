import { describe, expect, it, vi } from "vitest";
import { createContactRuntimeIntegration } from "../src/integrations/contact-runtime.js";

const invokeSetup = async (options: {
  submissionRequested: boolean;
  legalReady: boolean;
  publicSiteKey: string;
}) => {
  const injectScript = vi.fn();
  const integration = createContactRuntimeIntegration(options);
  const setup = integration.hooks["astro:config:setup"];
  if (!setup) throw new Error("missing config setup hook");
  await setup({ injectScript } as never);
  return injectScript;
};

describe("production contact runtime integration", () => {
  it.each([
    { submissionRequested: false, legalReady: false },
    { submissionRequested: true, legalReady: false },
    { submissionRequested: false, legalReady: true },
  ])("emits no client unless submission and legal readiness are both active", async (state) => {
    const injectScript = await invokeSetup({
      ...state,
      publicSiteKey: "reviewed-public-smartcaptcha-key",
    });

    expect(injectScript).not.toHaveBeenCalled();
  });

  it("injects the shared production initializer exactly once on the ready path", async () => {
    const injectScript = await invokeSetup({
      submissionRequested: true,
      legalReady: true,
      publicSiteKey: "reviewed-public-smartcaptcha-key",
    });

    expect(injectScript).toHaveBeenCalledTimes(1);
    expect(injectScript).toHaveBeenCalledWith(
      "page",
      expect.stringMatching(/^import \{ initializeContactForms \} from ".*contact-form\.ts";\ninitializeContactForms\(\);$/),
    );
  });

  it.each(["", "short", "contains whitespace", "contains-secret=value"])(
    "rejects unreviewable public site key %j on an otherwise ready path",
    async (publicSiteKey) => {
      await expect(invokeSetup({
        submissionRequested: true,
        legalReady: true,
        publicSiteKey,
      })).rejects.toThrow("A reviewed public SmartCaptcha site key is required");
    },
  );
});
