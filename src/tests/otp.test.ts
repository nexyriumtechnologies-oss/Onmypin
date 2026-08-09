import { describe, expect, it } from "vitest";
import {
  generateOtpCode,
  hashOtp,
  safeCompare,
} from "@/lib/crypto";
import {
  isOtpExpired,
  canVerifyOtp,
  MAX_OTP_ATTEMPTS,
} from "@/modules/auth/otp.service";

describe("OTP code generation", () => {
  it("generates a 6-digit numeric code", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("never stores the plain OTP — only its hash", () => {
    const code = "123456";
    const stored = hashOtp(code);
    expect(stored).not.toContain(code);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });

  it("safeCompare is constant-time-ish and correct", () => {
    const a = hashOtp("123456");
    const b = hashOtp("123456");
    const c = hashOtp("654321");
    expect(safeCompare(a, b)).toBe(true);
    expect(safeCompare(a, c)).toBe(false);
    expect(safeCompare(a, "nope")).toBe(false);
  });
});

describe("OTP expiry logic", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("considers a future expiry active and a past one expired", async () => {
    expect(await isOtpExpired(new Date(now.getTime() + 60_000), now)).toBe(false);
    expect(await isOtpExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });

  it("blocks verification when expired, already verified, or out of attempts", () => {
    const fresh = { attempts: 0, verified: false, expiresAt: new Date(now.getTime() + 60_000) };
    expect(canVerifyOtp(fresh, now)).toBe(true);

    const expired = { attempts: 0, verified: false, expiresAt: new Date(now.getTime() - 1) };
    expect(canVerifyOtp(expired, now)).toBe(false);

    const verified = { attempts: 0, verified: true, expiresAt: new Date(now.getTime() + 60_000) };
    expect(canVerifyOtp(verified, now)).toBe(false);

    const exhausted = { attempts: MAX_OTP_ATTEMPTS, verified: false, expiresAt: new Date(now.getTime() + 60_000) };
    expect(canVerifyOtp(exhausted, now)).toBe(false);
  });
});
