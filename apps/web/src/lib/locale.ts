import type { Locale } from "@vbtech/content";

export type LocalizedRoute =
  | "home"
  | "legal-register"
  | "privacy-policy"
  | "personal-data-consent";

const LOCALIZED_PATHS = {
  ru: {
    home: "/",
    "legal-register": "/legal/",
    "privacy-policy": "/privacy/",
    "personal-data-consent": "/personal-data-consent/",
  },
  en: {
    home: "/en/",
    "legal-register": "/en/legal/",
    "privacy-policy": "/en/privacy/",
    "personal-data-consent": "/en/personal-data-consent/",
  },
} as const satisfies Readonly<Record<Locale, Readonly<Record<LocalizedRoute, string>>>>;

export const localizedPath = (locale: Locale, route: LocalizedRoute): string =>
  LOCALIZED_PATHS[locale][route];
