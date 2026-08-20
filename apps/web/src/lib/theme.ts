export type ThemeMode = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "vbtech-theme-v1";

export const parseTheme = (value: unknown): ThemeMode =>
  value === "light" || value === "dark" || value === "system" ? value : "system";

export const resolveTheme = (mode: ThemeMode, prefersDark: boolean): "light" | "dark" => {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return mode;
};
