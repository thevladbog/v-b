export type PublicRoute = "/" | "/en/";

export const PUBLIC_ROUTES = ["/", "/en/"] as const satisfies readonly PublicRoute[];

export type DraftLegalRoute =
  | "/legal/"
  | "/privacy/"
  | "/personal-data-consent/"
  | "/en/legal/"
  | "/en/privacy/"
  | "/en/personal-data-consent/";

export const DRAFT_LEGAL_ROUTES = [
  "/legal/",
  "/privacy/",
  "/personal-data-consent/",
  "/en/legal/",
  "/en/privacy/",
  "/en/personal-data-consent/",
] as const satisfies readonly DraftLegalRoute[];

export const REACHABLE_HTML_ROUTES = [
  ...PUBLIC_ROUTES,
  ...DRAFT_LEGAL_ROUTES,
] as const;

export const DISCOVERY_ARTIFACT_ROUTES = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
] as const;
