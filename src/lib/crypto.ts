import { createHash, randomInt, randomBytes } from "node:crypto";

/** 6-digit OTP via crypto.randomInt — cryptographically random. */
export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

function otpSalt(): string {
  const salt = process.env.OTP_HASH_SALT;
  if (!salt || salt.length < 16) {
    // Never fall back to a default — startup env-check should have caught
    // this; fail loudly even if it didn't.
    throw new Error(
      "OTP_HASH_SALT is missing or too short. Set a long random OTP_HASH_SALT in .env — the server refuses to start without it",
    );
  }
  return salt;
}

/** Hash an OTP — plain OTP codes are never stored. */
export function hashOtp(code: string): string {
  return createHash("sha256").update(`${code}:${otpSalt()}`).digest("hex");
}

/** Constant-time comparison to avoid timing attacks. */
export function safeCompare(actualHash: string, expectedHash: string): boolean {
  const a = Buffer.from(actualHash);
  const b = Buffer.from(expectedHash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function generateOpaqueToken(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function random4Digit(): string {
  return randomInt(1000, 10000).toString();
}
