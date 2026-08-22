export type PublicRoute = "/" | "/en/";

export const PUBLIC_ROUTES = ["/", "/en/"] as const satisfies readonly PublicRoute[];

export type LegalRoute =
  | "/legal/"
  | "/privacy/"
  | "/personal-data-consent/"
  | "/en/legal/"
  | "/en/privacy/"
  | "/en/personal-data-consent/";

export const LEGAL_ROUTES = [
  "/legal/",
  "/privacy/",
  "/personal-data-consent/",
  "/en/legal/",
  "/en/privacy/",
  "/en/personal-data-consent/",
] as const satisfies readonly LegalRoute[];

export const REACHABLE_HTML_ROUTES = [
  ...PUBLIC_ROUTES,
  ...LEGAL_ROUTES,
] as const;

export const DISCOVERY_ARTIFACT_ROUTES = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
] as const;
