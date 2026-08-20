import { THEME_STORAGE_KEY, parseTheme, resolveTheme, type ThemeMode } from "../lib/theme.js";

const colorSchemeQuery = "(prefers-color-scheme: dark)";

const readStoredMode = (): ThemeMode => {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
};

const persistMode = (mode: ThemeMode): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private or hardened browsing contexts.
  }
};

export const initializeThemeControls = (): void => {
  const root = document.documentElement;
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-theme-control] button[data-theme-mode]");
  let mediaQuery: MediaQueryList | undefined;

  try {
    mediaQuery = window.matchMedia(colorSchemeQuery);
  } catch {
    mediaQuery = undefined;
  }

  let mode = readStoredMode();

  const render = (): void => {
    const theme = resolveTheme(mode, mediaQuery?.matches ?? false);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeMode === mode));
    });
  };

  const selectMode = (nextMode: ThemeMode): void => {
    mode = nextMode;
    persistMode(mode);
    render();
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => selectMode(parseTheme(button.dataset.themeMode)));
  });

  mediaQuery?.addEventListener("change", () => {
    if (mode === "system") {
      render();
    }
  });

  render();
};
