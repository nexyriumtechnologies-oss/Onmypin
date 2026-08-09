import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash } from "node:crypto";
import { ApiError } from "@/middleware/errorHandler";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AccessTokenPayload {
  userId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  jti: string;
}

function getSecret(kind: "access" | "refresh"): string {
  const secret =
    kind === "access"
      ? process.env.JWT_ACCESS_SECRET
      : process.env.JWT_REFRESH_SECRET;
  if (!secret || secret.length < 16) {
    throw new ApiError(
      500,
      "JWT_SECRET_MISCONFIGURED",
      `JWT_${kind.toUpperCase()}_SECRET is missing or too short`,
    );
  }
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getSecret("access"), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  } satisfies SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  // `jti` in the payload becomes the token id (jsonwebtoken forbids jwtid + jti together)
  return jwt.sign(payload, getSecret("refresh"), {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  } satisfies SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, getSecret("access"));
    if (typeof decoded === "string" || typeof decoded.userId !== "string") {
      throw new Error("invalid payload");
    }
    return { userId: decoded.userId };
  } catch {
    throw new ApiError(401, "INVALID_ACCESS_TOKEN", "Access token is invalid or expired");
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, getSecret("refresh"));
    if (
      typeof decoded === "string" ||
      typeof decoded.userId !== "string" ||
      typeof decoded.sessionId !== "string" ||
      typeof decoded.jti !== "string"
    ) {
      throw new Error("invalid payload");
    }
    return { userId: decoded.userId, sessionId: decoded.sessionId, jti: decoded.jti };
  } catch {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
