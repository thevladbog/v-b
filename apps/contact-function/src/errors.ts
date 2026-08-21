import type { ContactErrorCode } from "@vbtech/contracts";

export class PublicContactError extends Error {
  readonly name = "PublicContactError";

  constructor(
    readonly code: ContactErrorCode,
    readonly status: number,
  ) {
    super(code);
  }
}

export const publicError = (
  code: ContactErrorCode,
  status: number,
): PublicContactError => new PublicContactError(code, status);

export const isPublicContactError = (
  error: unknown,
): error is PublicContactError => error instanceof PublicContactError;
