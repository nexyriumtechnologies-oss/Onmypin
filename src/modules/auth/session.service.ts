import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import {
  hashToken,
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/jwt";
import { generateOpaqueToken } from "@/lib/crypto";
import { logger } from "@/lib/logger";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Create a session row + revocable refresh token, then sign both tokens. */
export async function openSession(
  userId: string,
  deviceInfo?: string,
  isNewUser = false,
): Promise<SessionTokens & { userId: string; isNewUser: boolean }> {
  const session = await prisma.session.create({
    data: {
      userId,
      deviceInfo: deviceInfo ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  const tokens = await issueTokens(userId, session.id);
  return { ...tokens, userId, isNewUser };
}

async function issueTokens(userId: string, sessionId: string): Promise<SessionTokens> {
  const jti = generateOpaqueToken(16);
  const refreshToken = signRefreshToken({ userId, sessionId, jti });
  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId,
      sessionId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return { accessToken: signAccessToken({ userId }), refreshToken };
}

/** Refresh-token rotation: revoke the presented token, issue a fresh pair. */
export async function rotateRefreshToken(
  presentedRefreshToken: string,
): Promise<SessionTokens> {
  const { userId, sessionId, jti } = verifyRefreshToken(presentedRefreshToken);

  const stored = await prisma.refreshToken.findUnique({ where: { id: jti } });
  if (
    !stored ||
    stored.revoked ||
    stored.userId !== userId ||
    stored.sessionId !== sessionId ||
    stored.tokenHash !== hashToken(presentedRefreshToken)
  ) {
    // Token reuse detected — revoke the ENTIRE session family, not just
    // this one token, and respond generically (no reuse/expiry/invalid leak).
    await revokeSessionFamily(sessionId);
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }
  if (stored.expiresAt.getTime() < Date.now()) {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new ApiError(403, "ACCOUNT_DISABLED", "Account is not active");
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked: true, revokedAt: new Date() },
  });

  // Slide the session expiry forward
  await prisma.session.update({
    where: { id: sessionId },
    data: { expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000) },
  });

  return issueTokens(userId, sessionId);
}

/** Logout: revoke the presented refresh token (and its session row). */
export async function logout(presentedRefreshToken: string, userId: string): Promise<void> {
  const { sessionId, jti } = verifyRefreshToken(presentedRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { id: jti } });

  if (stored && stored.userId === userId && !stored.revoked) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true, revokedAt: new Date() },
    });
    await prisma.session.deleteMany({ where: { id: sessionId, userId } }).catch(() => {
      logger.warn(`Session ${sessionId} already gone during logout`);
    });
  }
}

async function revokeSessionFamily(sessionId: string): Promise<void> {
  // Every refresh token issued for this session shares `sessionId` —
  // revoke all of them, then drop the session row (cascades the tokens).
  await prisma.refreshToken.updateMany({
    where: { sessionId },
    data: { revoked: true, revokedAt: new Date() },
  });
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Revoke all active sessions and refresh tokens for a user (e.g. on deactivation). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });
  await prisma.session.deleteMany({ where: { userId } });
}

