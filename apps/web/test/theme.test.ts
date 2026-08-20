import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, parseTheme, resolveTheme } from "../src/lib/theme.js";
import { bindThemeControls } from "../src/scripts/theme.js";

const firstHeadInlineScript = (html: string): string | undefined => {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];

  return head?.match(/<script>[\s\S]*?<\/script>/)?.[0];
};

const expectedThemeColors = {
  light: "#f4f0e8",
  dark: "#0c0e10",
} as const;

const generatedRuntime = async (html: string): Promise<string> => {
  const script = html.match(/<script type="module"(?: src="([^"]+)")?>([\s\S]*?)<\/script>/);
  const src = script?.[1];
  if (!src) return script?.[2] ?? "";
  return readFile(new URL(`../dist${src}`, import.meta.url), "utf8");
};

type ChangeListener = () => void;

const createButton = (mode: "system" | "light" | "dark") => {
  let clickListener: ChangeListener | undefined;

  return {
    dataset: { themeMode: mode },
    attributes: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    },
    addEventListener(event: "click", listener: ChangeListener) {
      if (event === "click") {
        clickListener = listener;
      }
    },
    click() {
      clickListener?.();
    },
  };
};

const createThemeButtons = () => {
  const header = ["system", "light", "dark"].map(createButton);
  const footer = ["system", "light", "dark"].map(createButton);

  return { header, footer, buttons: [...header, ...footer] };
};

const themePages = [
  {
    locale: "ru",
    file: "dist/index.html",
    labels: ["Тема: системная", "Тема: светлая", "Тема: тёмная"],
  },
  {
    locale: "en",
    file: "dist/en/index.html",
    labels: ["Theme: system", "Theme: light", "Theme: dark"],
  },
] as const;

describe("theme preferences", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", true, "light"],
    ["dark", false, "dark"],
  ] as const)("resolves %s mode when the OS prefers dark=%s", (mode, prefersDark, expected) => {
    expect(resolveTheme(mode, prefersDark)).toBe(expected);
  });

  it("falls back to system for missing, invalid, and corrupt stored preferences", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
    expect(parseTheme({ mode: "dark" })).toBe("system");
  });

  it("uses the versioned storage key for an explicit preference", () => {
    expect(THEME_STORAGE_KEY).toBe("vbtech-theme-v1");
  });
});

describe("generated theme controls", () => {
  it("does not mistake a storage key before styles for an executable head bootstrap", () => {
    const weakFixture = `<html><head><meta name="theme" content="${THEME_STORAGE_KEY}"><link rel="stylesheet" href="/app.css"><script>window.theme = "dark";</script></head></html>`;

    expect(weakFixture.indexOf(THEME_STORAGE_KEY)).toBeLessThan(
      weakFixture.indexOf('rel="stylesheet"'),
    );
    expect(weakFixture.indexOf(firstHeadInlineScript(weakFixture) ?? "")).toBeGreaterThan(
      weakFixture.indexOf('rel="stylesheet"'),
    );
  });

  it("keeps an explicit stored choice when system preference access fails", async () => {
    const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
    const bootstrap = firstHeadInlineScript(html)?.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    const root = { dataset: {}, style: {} };
    const themeColor = { content: expectedThemeColors.light };

    expect(bootstrap).toBeDefined();
    runInNewContext(bootstrap ?? "", {
      document: {
        documentElement: root,
        querySelector: (selector: string) => selector === 'meta[name="theme-color"]' ? themeColor : null,
      },
      window: {
        localStorage: { getItem: () => "dark" },
        matchMedia: () => {
          throw new Error("Unavailable");
        },
      },
    });

    expect(root.dataset).toMatchObject({ theme: "dark" });
    expect(root.style).toMatchObject({ colorScheme: "dark" });
    expect(themeColor.content).toBe(expectedThemeColors.dark);
  });

  it.each(themePages)(
    "places a defensive bootstrap before styles and renders localized controls for $locale",
    async ({ file, labels }) => {
      const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
      const bootstrap = firstHeadInlineScript(html);
      const bootstrapIndex = html.indexOf(bootstrap ?? "");
      const stylesheetIndex = html.indexOf('rel="stylesheet"');

      expect(bootstrap).toContain(THEME_STORAGE_KEY);
      expect(bootstrapIndex).toBeGreaterThan(-1);
      expect(bootstrapIndex).toBeLessThan(stylesheetIndex);
      expect(html).toMatch(/<link rel="stylesheet" href="\/_astro\//);
      expect(html.match(/<meta name="theme-color"/g)).toHaveLength(1);
      expect(html).toContain(`<meta name="theme-color" content="${expectedThemeColors.light}">`);
      expect(html.match(/<section class="theme-control" data-theme-control/g)).toHaveLength(2);

      for (const mode of ["system", "light", "dark"]) {
        expect(html.match(new RegExp(`data-theme-mode="${mode}"`, "g"))).toHaveLength(2);
      }

      for (const label of labels) {
        expect(html).toContain(`aria-label="${label}"`);
      }
    },
  );

  it("keeps the runtime local, static, and on the same storage key", async () => {
    const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
    const runtime = await generatedRuntime(html);

    expect(runtime).toContain(THEME_STORAGE_KEY);
    expect(runtime).not.toMatch(/\b(?:eval|fetch)\s*\(/);
    expect(runtime).not.toContain("import(");
    expect(runtime).not.toMatch(/https?:\/\//);
  });
});

describe("theme control runtime", () => {
  it("synchronizes header and footer through the modern system-change listener", () => {
    const { header, footer, buttons } = createThemeButtons();
    const root = { dataset: {}, style: {} };
    const preferences = new Map<string, string>();
    const themeColor = { content: expectedThemeColors.light };
    let systemChange: ChangeListener | undefined;
    const mediaQuery = {
      matches: false,
      addEventListener(event: "change", listener: ChangeListener) {
        if (event === "change") {
          systemChange = listener;
        }
      },
    };

    bindThemeControls({
      root,
      buttons,
      themeColor,
      storage: {
        getItem: (key) => preferences.get(key) ?? null,
        setItem: (key, value) => preferences.set(key, value),
      },
      mediaQuery,
    });

    header[2].click();

    expect(root.dataset).toMatchObject({ theme: "dark" });
    expect(themeColor.content).toBe(expectedThemeColors.dark);
    expect(preferences.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(header[2].attributes.get("aria-pressed")).toBe("true");
    expect(footer[2].attributes.get("aria-pressed")).toBe("true");
    expect(footer[0].attributes.get("aria-pressed")).toBe("false");

    header[0].click();
    mediaQuery.matches = true;
    systemChange?.();

    expect(root.dataset).toMatchObject({ theme: "dark" });
    expect(themeColor.content).toBe(expectedThemeColors.dark);
    expect(header[0].attributes.get("aria-pressed")).toBe("true");
    expect(footer[0].attributes.get("aria-pressed")).toBe("true");
  });

  it("uses the legacy system-change listener when addEventListener is unavailable", () => {
    const { buttons } = createThemeButtons();
    const root = { dataset: {}, style: {} };
    const themeColor = { content: expectedThemeColors.light };
    let systemChange: ChangeListener | undefined;
    const mediaQuery = {
      matches: false,
      addListener(listener: ChangeListener) {
        systemChange = listener;
      },
    };

    bindThemeControls({ root, buttons, mediaQuery, themeColor });

    mediaQuery.matches = true;
    systemChange?.();

    expect(root.dataset).toMatchObject({ theme: "dark" });
    expect(themeColor.content).toBe(expectedThemeColors.dark);
  });
});
