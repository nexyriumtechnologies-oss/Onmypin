import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { sendOtp } from "./otp.service";
import { verifyOtpCode } from "./otp.service";
import { openSession } from "./session.service";
import { logger } from "@/lib/logger";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 };
const OTP_TTL_MS = 5 * 60 * 1000;

// ---- password hashing (same scrypt params as adminPassword.ts) ----

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString("hex");
  const key = scryptSync(password, salt, SCRYPT_PARAMS.dkLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const storedKey = Buffer.from(keyHex, "hex");
  const derived = scryptSync(password, salt, SCRYPT_PARAMS.dkLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return timingSafeEqual(storedKey, derived);
}

// ---- Step 1: validate inputs → store pending → send OTP ----

export async function initiateRegister(
  name: string,
  email: string,
  mobile: string,
  password: string,
): Promise<void> {
  // Check for existing accounts
  const existingMobile = await prisma.user.findUnique({ where: { mobile } });
  if (existingMobile) {
    throw new ApiError(409, "MOBILE_TAKEN", "This mobile number is already registered");
  }

  const passwordHash = await hashPassword(password);

  // Delete any previous pending attempt for this mobile, then create fresh.
  // Avoids upsert complications when email is also @unique on the model.
  await prisma.pendingRegistration.deleteMany({ where: { mobile } });
  await prisma.pendingRegistration.create({
    data: {
      mobile,
      name,
      email,
      passwordHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  await sendOtp(mobile, "REGISTER");
  logger.info(`Registration initiated for mobile ${mobile}`);
}

// ---- Step 2: verify OTP → create user → open session ----

export async function completeRegister(
  mobile: string,
  otp: string,
  deviceInfo?: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string; isNewUser: boolean }> {
  // Verify the OTP (reuses shared helper — throws on invalid/expired)
  await verifyOtpCode(mobile, otp, "REGISTER");

  const pending = await prisma.pendingRegistration.findUnique({ where: { mobile } });
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "REGISTRATION_EXPIRED", "Registration session expired. Please start again");
  }

  // Race-condition guard: re-check uniqueness before creating
  const mobileConflict = await prisma.user.findUnique({ where: { mobile } });
  if (mobileConflict) {
    await prisma.pendingRegistration.delete({ where: { mobile } });
    throw new ApiError(409, "MOBILE_TAKEN", "This mobile was registered by another account");
  }

  // Create user and clean up pending record atomically
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        mobile,
        name: pending.name,
        email: pending.email,
        passwordHash: pending.passwordHash,
      },
    });
    await tx.pendingRegistration.delete({ where: { mobile } });
    return created;
  });

  logger.info(`User registered: ${user.id} (${mobile})`);
  return openSession(user.id, deviceInfo, true);
}
