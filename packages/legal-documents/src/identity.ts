import type { LegalDocumentCode } from "./types.js";

export type LegalRevision = `${number}.${number}/${number}`;
export type LegalPublishedIdentity = `${LegalDocumentCode}/${LegalRevision}`;

const LEGAL_REVISION_PATTERN = /^\d{4}\.(?:0[1-9]|1[0-2])\/(?:0[1-9]|[1-9]\d)$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidLegalRevision(value: unknown): value is LegalRevision {
  return typeof value === "string" && LEGAL_REVISION_PATTERN.test(value);
}

export function isValidIsoDate(value: unknown): value is `${number}-${number}-${number}` {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
