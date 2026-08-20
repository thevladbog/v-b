interface NavigationEvent {
  key?: string;
  matches?: boolean;
}

type NavigationListener = (event: NavigationEvent) => void;

interface EventTargetLike {
  addEventListener(type: string, listener: NavigationListener): void;
  removeEventListener(type: string, listener: NavigationListener): void;
}

interface ClassListLike {
  add(value: string): void;
  remove(value: string): void;
}

interface ButtonLike extends EventTargetLike {
  hidden: boolean | string;
  setAttribute(name: string, value: string): void;
  focus(): void;
}

interface MediaQueryLike {
  matches: boolean;
  addEventListener?: (type: string, listener: NavigationListener) => void;
  removeEventListener?: (type: string, listener: NavigationListener) => void;
  addListener?: (listener: NavigationListener) => void;
  removeListener?: (listener: NavigationListener) => void;
}

export interface NavigationElements {
  header: { classList: ClassListLike };
  button: ButtonLike;
  navigation: { hidden: boolean | string };
  links: readonly EventTargetLike[];
  documentTarget: EventTargetLike;
  mediaQuery: MediaQueryLike;
  openLabel: string;
  closeLabel: string;
}

export function bindNavigation(elements: NavigationElements): () => void {
  const {
    header,
    button,
    navigation,
    links,
    documentTarget,
    mediaQuery,
    openLabel,
    closeLabel,
  } = elements;
  let open = false;

  const render = () => {
    const mobile = mediaQuery.matches;
    if (!mobile) open = false;
    header.classList.add("navigation-enhanced");
    if (open) header.classList.add("navigation-open");
    else header.classList.remove("navigation-open");
    button.hidden = !mobile;
    button.setAttribute("aria-expanded", String(mobile && open));
    button.setAttribute("aria-label", mobile && open ? closeLabel : openLabel);
    navigation.hidden = mobile && !open;
  };

  const close = () => {
    open = false;
    render();
  };
  const onButtonClick: NavigationListener = () => {
    if (!mediaQuery.matches) return;
    open = !open;
    render();
  };
  const onDocumentKeydown: NavigationListener = (event) => {
    if (event.key !== "Escape" || !open || !mediaQuery.matches) return;
    close();
    button.focus();
  };
  const onMediaChange: NavigationListener = () => render();

  button.addEventListener("click", onButtonClick);
  documentTarget.addEventListener("keydown", onDocumentKeydown);
  links.forEach((link) => link.addEventListener("click", close));
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", onMediaChange);
  } else {
    mediaQuery.addListener?.(onMediaChange);
  }

  render();

  return () => {
    button.removeEventListener("click", onButtonClick);
    documentTarget.removeEventListener("keydown", onDocumentKeydown);
    links.forEach((link) => link.removeEventListener("click", close));
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener("change", onMediaChange);
    } else {
      mediaQuery.removeListener?.(onMediaChange);
    }
  };
}

export function initializeNavigation(
  documentTarget: Document = document,
  mediaQuery: MediaQueryList = window.matchMedia("(max-width: 40rem)"),
): (() => void) | undefined {
  const header = documentTarget.querySelector<HTMLElement>("[data-site-header]");
  const button = documentTarget.querySelector<HTMLButtonElement>("[data-navigation-toggle]");
  const navigation = documentTarget.querySelector<HTMLElement>("[data-site-navigation]");
  if (!header || !button || !navigation) return undefined;

  return bindNavigation({
    header,
    button,
    navigation,
    links: [...navigation.querySelectorAll<HTMLAnchorElement>("a[href]")],
    documentTarget,
    mediaQuery,
    openLabel: button.dataset.openLabel ?? "",
    closeLabel: button.dataset.closeLabel ?? "",
  });
}
