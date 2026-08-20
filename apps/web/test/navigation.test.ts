import { describe, expect, it } from "vitest";
import { bindNavigation } from "../src/scripts/navigation.js";

type Listener = (event: { key?: string; matches?: boolean }) => void;

class FakeTarget {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: { key?: string; matches?: boolean } = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

class FakeClassList {
  private readonly values = new Set<string>();

  add(value: string) {
    this.values.add(value);
  }

  remove(value: string) {
    this.values.delete(value);
  }

  contains(value: string) {
    return this.values.has(value);
  }
}

class FakeButton extends FakeTarget {
  hidden = true;
  focused = false;
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  focus() {
    this.focused = true;
  }
}

class FakeMediaQuery {
  matches: boolean;
  modernListener?: Listener;
  legacyListener?: Listener;

  constructor(matches: boolean, legacy = false) {
    this.matches = matches;
    if (legacy) {
      this.addEventListener = undefined;
      this.removeEventListener = undefined;
    }
  }

  addEventListener: ((_type: string, listener: Listener) => void) | undefined = (
    _type,
    listener,
  ) => {
    this.modernListener = listener;
  };

  removeEventListener: ((_type: string, listener: Listener) => void) | undefined = (
    _type,
    listener,
  ) => {
    if (this.modernListener === listener) this.modernListener = undefined;
  };

  addListener = (listener: Listener) => {
    this.legacyListener = listener;
  };

  removeListener = (listener: Listener) => {
    if (this.legacyListener === listener) this.legacyListener = undefined;
  };

  change(matches: boolean) {
    this.matches = matches;
    (this.modernListener ?? this.legacyListener)?.({ matches });
  }
}

const setup = (legacy = false) => {
  const header = { classList: new FakeClassList() };
  const button = new FakeButton();
  const navigation = { hidden: false };
  const links = [new FakeTarget(), new FakeTarget()];
  const documentTarget = new FakeTarget();
  const mediaQuery = new FakeMediaQuery(true, legacy);
  const cleanup = bindNavigation({
    header,
    button,
    navigation,
    links,
    documentTarget,
    mediaQuery,
    openLabel: "Open menu",
    closeLabel: "Close menu",
  });
  return { header, button, navigation, links, documentTarget, mediaQuery, cleanup };
};

describe("mobile navigation binding", () => {
  it("marks enhancement readiness and starts closed on mobile", () => {
    const { header, button, navigation } = setup();

    expect(header.classList.contains("navigation-enhanced")).toBe(true);
    expect(header.classList.contains("navigation-open")).toBe(false);
    expect(button.hidden).toBe(false);
    expect(button.attributes.get("aria-expanded")).toBe("false");
    expect(button.attributes.get("aria-label")).toBe("Open menu");
    expect(navigation.hidden).toBe(true);
  });

  it("opens and closes with localized state and lets link activation close it", () => {
    const { header, button, navigation, links } = setup();

    button.dispatch("click");
    expect(header.classList.contains("navigation-open")).toBe(true);
    expect(button.attributes.get("aria-expanded")).toBe("true");
    expect(button.attributes.get("aria-label")).toBe("Close menu");
    expect(navigation.hidden).toBe(false);

    links[0]?.dispatch("click");
    expect(header.classList.contains("navigation-open")).toBe(false);
    expect(button.attributes.get("aria-expanded")).toBe("false");
    expect(button.attributes.get("aria-label")).toBe("Open menu");
    expect(navigation.hidden).toBe(true);
  });

  it("closes on Escape and restores focus only when the menu was open", () => {
    const { button, documentTarget } = setup();

    documentTarget.dispatch("keydown", { key: "Escape" });
    expect(button.focused).toBe(false);

    button.dispatch("click");
    documentTarget.dispatch("keydown", { key: "Escape" });
    expect(button.attributes.get("aria-expanded")).toBe("false");
    expect(button.focused).toBe(true);
  });

  it("clears mobile-open state on desktop and restores it closed on return", () => {
    const { header, button, navigation, mediaQuery } = setup();
    button.dispatch("click");

    mediaQuery.change(false);
    expect(header.classList.contains("navigation-open")).toBe(false);
    expect(button.hidden).toBe(true);
    expect(button.attributes.get("aria-expanded")).toBe("false");
    expect(navigation.hidden).toBe(false);

    mediaQuery.change(true);
    expect(button.hidden).toBe(false);
    expect(navigation.hidden).toBe(true);
  });

  it("uses and removes the modern media-query listener", () => {
    const { mediaQuery, cleanup } = setup();
    expect(mediaQuery.modernListener).toBeTypeOf("function");
    expect(mediaQuery.legacyListener).toBeUndefined();

    cleanup();
    expect(mediaQuery.modernListener).toBeUndefined();
  });

  it("falls back to and removes the legacy media-query listener", () => {
    const { mediaQuery, cleanup } = setup(true);
    expect(mediaQuery.legacyListener).toBeTypeOf("function");

    mediaQuery.change(false);
    cleanup();
    expect(mediaQuery.legacyListener).toBeUndefined();
  });
});
