export function assertCompleteLocalizedStrings(
  value: unknown,
  path = "content",
): void {
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      throw new Error(`Missing localized string at ${path}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertCompleteLocalizedStrings(item, `${path}[${index}]`),
    );
    return;
  }

  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      assertCompleteLocalizedStrings(item, `${path}.${key}`),
    );
  }
}
