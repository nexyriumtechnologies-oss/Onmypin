import { getStateCode } from "./stateCodes";
import { random4Digit } from "@/lib/crypto";
import { ApiError } from "@/middleware/errorHandler";
import { logger } from "@/lib/logger";

export const DIGIPIN_FORMAT = /^[A-Z]{2}\d{6}$/;

/**
 * DigiPin format: [2-letter state code][4-digit random][last 2 digits of pincode]
 * Example: WB + 4728 + 01 = WB472801
 *
 * Uniqueness is enforced by the DB `@@unique([digipinNumber])` constraint.
 * On a Prisma P2002 (unique) collision we retry — no pre-check-then-insert.
 * The caller supplies `persist` (typically a prisma.digiPin.create) so tests
 * can inject an in-memory store that mimics the constraint.
 */
export async function generateDigiPin(
  state: string,
  pincode: string,
  opts: { maxRetries?: number; persist: (digipinNumber: string) => Promise<unknown> },
): Promise<string> {
  const maxRetries = opts.maxRetries ?? 5;
  const { persist } = opts;

  const stateCode = getStateCode(state);
  const pincodeSuffix = pincode.slice(-2);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const digipinNumber = `${stateCode}${random4Digit()}${pincodeSuffix}`;
    try {
      await persist(digipinNumber);
      return digipinNumber;
    } catch (err) {
      const isUniqueCollision =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (!isUniqueCollision) throw err;
      logger.warn(`DigiPin collision on "${digipinNumber}", retrying (${attempt}/${maxRetries})`);
    }
  }

  throw new ApiError(
    500,
    "DIGIPIN_GENERATION_FAILED",
    `Could not generate a unique DigiPin after ${maxRetries} attempts`,
  );
}
