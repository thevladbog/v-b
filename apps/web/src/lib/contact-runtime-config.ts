const PUBLIC_SMARTCAPTCHA_SITE_KEY_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export function isReviewedPublicSmartCaptchaSiteKey(value: string): boolean {
  return PUBLIC_SMARTCAPTCHA_SITE_KEY_PATTERN.test(value);
}

export function assertReviewedPublicSmartCaptchaSiteKey(value: string): void {
  if (!isReviewedPublicSmartCaptchaSiteKey(value)) {
    throw new Error("A reviewed public SmartCaptcha site key is required for active contact submission");
  }
}
