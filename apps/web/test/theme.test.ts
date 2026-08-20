import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, parseTheme, resolveTheme } from "../src/lib/theme.js";

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
  it("keeps an explicit stored choice when system preference access fails", async () => {
    const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
    const bootstrap = html.match(/<head><script>([\s\S]*?)<\/script>/)?.[1];
    const root = { dataset: {}, style: {} };

    expect(bootstrap).toBeDefined();
    runInNewContext(bootstrap ?? "", {
      document: { documentElement: root },
      window: {
        localStorage: { getItem: () => "dark" },
        matchMedia: () => {
          throw new Error("Unavailable");
        },
      },
    });

    expect(root.dataset).toMatchObject({ theme: "dark" });
    expect(root.style).toMatchObject({ colorScheme: "dark" });
  });

  it.each(themePages)(
    "places a defensive bootstrap before styles and renders localized controls for $locale",
    async ({ file, labels }) => {
      const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
      const bootstrapIndex = html.indexOf(THEME_STORAGE_KEY);
      const stylesheetIndex = html.indexOf('rel="stylesheet"');

      expect(bootstrapIndex).toBeGreaterThan(-1);
      expect(stylesheetIndex).toBeGreaterThan(bootstrapIndex);
      expect(html).toMatch(/<link rel="stylesheet" href="\/_astro\//);
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
    const runtime = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";

    expect(runtime).toContain(THEME_STORAGE_KEY);
    expect(runtime).not.toMatch(/\b(?:eval|fetch)\s*\(/);
    expect(runtime).not.toContain("import(");
    expect(runtime).not.toMatch(/https?:\/\//);
  });
});
