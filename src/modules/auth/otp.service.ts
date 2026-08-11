import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { getRateLimiter, OTP_RATE_LIMIT } from "@/lib/rateLimit";
import {
  generateOtpCode,
  hashOtp,
  safeCompare,
} from "@/lib/crypto";
import { getOtpProvider } from "@/lib/otp";
import "@/lib/otp/console.otp.provider"; // register the console provider
import "@/lib/otp/yourbulksms.otp.provider"; // register the YourBulkSMS provider
import { openSession } from "./session.service";
import { logger } from "@/lib/logger";

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_OTP_ATTEMPTS = 3;

/**
 * Dev bypass removed on 2026-08-11 — real SMS (YourBulkSMS) is now the only path.
 * Old behavior: when OTP_BYPASS_ENABLED=true and OTP_BYPASS_MOBILE matched, no SMS
 * was sent and the fixed OTP_BYPASS_CODE always verified.
 *   function isOtpBypassEnabled(mobile: string): boolean {
 *     return (
 *       process.env.OTP_BYPASS_ENABLED === "true" &&
 *       process.env.OTP_BYPASS_MOBILE === mobile
 *     );
 *   }
 *   const OTP_BYPASS_CODE = process.env.OTP_BYPASS_CODE ?? "123456";
 */

export async function isOtpExpired(expiresAt: Date, now = new Date()): Promise<boolean> {
  return expiresAt.getTime() < now.getTime();
}

export interface OtpRecordLike {
  attempts: number;
  verified: boolean;
  expiresAt: Date;
}

export function canVerifyOtp(record: OtpRecordLike, now = new Date()): boolean {
  if (record.verified) return false;
  if (record.expiresAt.getTime() < now.getTime()) return false;
  return record.attempts < MAX_OTP_ATTEMPTS;
}

/** Step 1 — generate + persist a hashed OTP, then hand it to the provider. */
export async function sendOtp(mobile: string, purpose = "AUTH"): Promise<void> {
  const key = `otp:send:${purpose}:${mobile}`;
  const { allowed, retryAfterSeconds } = await getRateLimiter().consume(key, OTP_RATE_LIMIT);
  if (!allowed) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Too many OTP requests. Try again in ${retryAfterSeconds}s`,
    );
  }

  // Invalidate any previous unconsumed OTP for this mobile+purpose
  await prisma.otpRecord.updateMany({
    where: { mobile, purpose, verified: false, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date(0) },
  });

  const code = generateOtpCode();
  await prisma.otpRecord.create({
    data: {
      mobile,
      purpose,
      otpHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  // Dev bypass removed 2026-08-11: always deliver via the real OTP provider.
  await getOtpProvider().sendOtp(mobile, code);
  logger.info(`OTP generated for ${mobile} (${purpose})`);
}

/** Step 2 — verify the OTP, create/find the user, and open a session. */
export async function verifyOtp(
  mobile: string,
  code: string,
  purpose = "AUTH",
  deviceInfo?: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string; isNewUser: boolean }> {
  const record = await prisma.otpRecord.findFirst({
    where: { mobile, purpose, verified: false },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw new ApiError(400, "OTP_NOT_FOUND", "No pending OTP found. Request a new one");
  }
  if (!canVerifyOtp(record)) {
    throw new ApiError(400, "OTP_EXPIRED", "OTP has expired or attempts exhausted. Request a new one");
  }
  if (!safeCompare(record.otpHash, hashOtp(code))) {
    await prisma.otpRecord.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const attemptsLeft = MAX_OTP_ATTEMPTS - record.attempts - 1;
    throw new ApiError(
      400,
      "OTP_INVALID",
      attemptsLeft > 0 ? `Invalid OTP. ${attemptsLeft} attempt(s) left` : "Invalid OTP. Request a new one",
    );
  }

  await prisma.otpRecord.update({
    where: { id: record.id },
    data: { verified: true },
  });

  let user = await prisma.user.findUnique({ where: { mobile } });
  let isNewUser = false;
  if (!user) {
    user = await prisma.user.create({ data: { mobile } });
    isNewUser = true;
  }
  if (user.accountStatus === "DEACTIVATED" || user.accountStatus === "DELETED") {
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account is deactivated or deleted");
  }

  return openSession(user.id, deviceInfo, isNewUser);
}
