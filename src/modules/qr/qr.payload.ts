/**
 * QR payload contract (client-visible).
 *
 * Since v1.1 the scanned payload IS the DigiPin number as plain text, so any
 * generic camera/QR scan shows the code directly — no app, no link, no
 * dead domain. Legacy rows (opaque `https://digipin.app/q/<token>` URLs)
 * still verify via dual-match in `verifyQrToken`, so already-printed codes
 * keep working.
 */

/** Legacy payload prefix — lookup-only, never generated anymore. */
export const LEGACY_QR_URL_PREFIX = "https://digipin.app/q/";

/** Build the payload for a newly issued QR: the DigiPin number itself. */
export function buildQrData(digipinNumber: string): string {
  return digipinNumber;
}

/**
 * Accept anything a scanner can hand us: a raw DigiPin number, a legacy
 * bare token, or a full legacy URL. Returns the lookup key (bare token for
 * legacy rows; the number itself for new rows).
 */
export function normalizeQrInput(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith(LEGACY_QR_URL_PREFIX)
    ? trimmed.slice(LEGACY_QR_URL_PREFIX.length)
    : trimmed;
}
