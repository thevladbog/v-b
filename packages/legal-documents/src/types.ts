import type { LegalPublishedIdentity, LegalRevision } from "./identity.js";

export type { LegalPublishedIdentity, LegalRevision } from "./identity.js";

export type LegalLocale = "ru" | "en";
export type LegalDocumentCode = "VBT-PD-01" | "VBT-PD-02";
export type LegalDocumentStatus = "draft" | "active" | "superseded" | "withdrawn";
export type LegalOperatorProfileId = "operator-vbtech-2026-08-20";
export type LegalDraftIdentity = `${LegalDocumentCode}/DRAFT`;
export type LegalDocumentIdentity = LegalDraftIdentity | LegalPublishedIdentity;

export type LegalContentRequirement =
  | "affirmative-action"
  | "authoritative-language"
  | "browser-storage"
  | "captcha"
  | "consent-boundary"
  | "cross-border"
  | "data-minimization"
  | "definitions"
  | "delivery-lifecycle"
  | "exclusions"
  | "incidents"
  | "legal-grounds"
  | "lifecycle"
  | "localization"
  | "logs"
  | "operations"
  | "operational-data"
  | "operator"
  | "principles"
  | "provider-review"
  | "providers"
  | "purposes"
  | "retention"
  | "security"
  | "sensitive-data-warning"
  | "scope"
  | "subject-rights"
  | "subjects"
  | "user-data"
  | "withdrawal";

export type LegalBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "ordered-list" | "unordered-list"; readonly items: readonly string[] }
  | {
      readonly kind: "definition-list";
      readonly items: readonly { readonly term: string; readonly detail: string }[];
    };

export interface LegalDocumentLocaleContent {
  readonly documentCode: LegalDocumentCode;
  readonly releaseIdentity: LegalDocumentIdentity;
  readonly locale: LegalLocale;
  readonly title: string;
  readonly description: string;
  readonly summary: string;
  readonly sections: readonly {
    readonly id: string;
    readonly requirements: readonly LegalContentRequirement[];
    readonly heading: string;
    readonly blocks: readonly LegalBlock[];
  }[];
}

interface LegalDocumentReleaseBase {
  readonly code: LegalDocumentCode;
  readonly operatorProfileId: LegalOperatorProfileId;
  readonly routes: Readonly<Record<LegalLocale, `/${string}/`>>;
}

export interface LegalDraftRelease extends LegalDocumentReleaseBase {
  readonly identity: LegalDraftIdentity;
  readonly revision: null;
  readonly effectiveDate: null;
  readonly status: "draft";
}

export interface LegalPublishedRelease extends LegalDocumentReleaseBase {
  readonly identity: LegalPublishedIdentity;
  readonly revision: LegalRevision;
  readonly effectiveDate: `${number}-${number}-${number}`;
  readonly status: "active" | "superseded" | "withdrawn";
  readonly supersedes?: LegalPublishedIdentity;
}

export type LegalDocumentRelease = LegalDraftRelease | LegalPublishedRelease;

export interface LegalDocumentSource {
  readonly releaseIdentity: LegalDocumentIdentity;
  readonly content: Readonly<Record<LegalLocale, LegalDocumentLocaleContent>>;
}

export type LegalDocumentView = LegalDocumentRelease & {
  readonly content: LegalDocumentLocaleContent;
};

export interface LegalOperatorProfile {
  readonly name: string;
  readonly address: string;
  readonly email: string;
  readonly phone: string;
  readonly site: `https://${string}`;
}
