import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { verifyPassword } from "./register.service";
import { openSession } from "./session.service";
import { logger } from "@/lib/logger";

/**
 * Mobile + password login.
 * All failure paths return the same generic 401 (INVALID_CREDENTIALS) —
 * no existence leak (unknown mobile looks identical to wrong password).
 */
export async function loginWithPassword(
  mobile: string,
  password: string,
  deviceInfo?: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string; isNewUser: boolean }> {
  const user = await prisma.user.findUnique({ where: { mobile } });

  // Constant-time-ish: always attempt a dummy verify even on miss so timing is stable.
  // Must be a valid salt:hexkey string so verifyPassword doesn't throw on Buffer.from.
  const DUMMY_HASH =
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef:" +
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" +
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(password, hashToCheck);

  if (!user || !user.passwordHash || !passwordOk) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  if (user.accountStatus === "DEACTIVATED" || user.accountStatus === "DELETED") {
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account is deactivated or deleted");
  }

  logger.info(`Password login: ${user.id} (${mobile})`);
  return openSession(user.id, deviceInfo, false);
}
