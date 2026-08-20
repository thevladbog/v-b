export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "vbtech-theme-v1";
export const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = {
  light: "#f4f0e8",
  dark: "#0c0e10",
};

export const parseTheme = (value: unknown): ThemeMode =>
  value === "light" || value === "dark" || value === "system" ? value : "system";

export const resolveTheme = (mode: ThemeMode, prefersDark: boolean): ResolvedTheme => {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return mode;
};
