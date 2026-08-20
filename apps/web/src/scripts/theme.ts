import { THEME_COLORS, THEME_STORAGE_KEY, parseTheme, resolveTheme, type ThemeMode } from "../lib/theme.js";

const colorSchemeQuery = "(prefers-color-scheme: dark)";

interface ThemeRoot {
  dataset: { theme?: string };
  style: { colorScheme: string };
}

interface ThemeButton {
  dataset: { themeMode?: string };
  setAttribute: (name: string, value: string) => void;
  addEventListener: (event: "click", listener: () => void) => void;
}

interface ThemeColorMeta {
  content: string;
}

interface ThemeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface ThemeMediaQuery {
  matches: boolean;
  addEventListener?: (event: "change", listener: () => void) => void;
  addListener?: (listener: () => void) => void;
}

interface ThemeRuntimeOptions {
  root: ThemeRoot;
  buttons: Iterable<ThemeButton>;
  themeColor?: ThemeColorMeta;
  storage?: ThemeStorage;
  mediaQuery?: ThemeMediaQuery;
}

const readStoredMode = (storage?: ThemeStorage): ThemeMode => {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
};

const persistMode = (storage: ThemeStorage | undefined, mode: ThemeMode): void => {
  try {
    storage?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private or hardened browsing contexts.
  }
};

export const bindThemeControls = ({
  root,
  buttons: buttonIterable,
  themeColor,
  storage,
  mediaQuery,
}: ThemeRuntimeOptions): void => {
  const buttons = Array.from(buttonIterable);
  let mode = readStoredMode(storage);

  const render = (): void => {
    const theme = resolveTheme(mode, mediaQuery?.matches ?? false);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (themeColor) themeColor.content = THEME_COLORS[theme];

    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeMode === mode));
    });
  };

  const selectMode = (nextMode: ThemeMode): void => {
    mode = nextMode;
    persistMode(storage, mode);
    render();
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => selectMode(parseTheme(button.dataset.themeMode)));
  });

  const handleSystemChange = (): void => {
    if (mode === "system") {
      render();
    }
  };

  if (typeof mediaQuery?.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleSystemChange);
  } else if (typeof mediaQuery?.addListener === "function") {
    mediaQuery.addListener(handleSystemChange);
  }

  render();
};

const getStorage = (): ThemeStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const getMediaQuery = (): ThemeMediaQuery | undefined => {
  try {
    return window.matchMedia(colorSchemeQuery);
  } catch {
    return undefined;
  }
};

export const initializeThemeControls = (): void => {
  bindThemeControls({
    root: document.documentElement,
    buttons: document.querySelectorAll<HTMLButtonElement>("[data-theme-control] button[data-theme-mode]"),
    themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]') ?? undefined,
    storage: getStorage(),
    mediaQuery: getMediaQuery(),
  });
};
