import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/lib/jwt";
import { ApiError } from "@/middleware/errorHandler";

const USER_ID = "user_abc123";

describe("JWT issue/verify", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken({ userId: USER_ID });
    expect(verifyAccessToken(token).userId).toBe(USER_ID);
  });

  it("round-trips a refresh token including jti/session", () => {
    const token = signRefreshToken({ userId: USER_ID, sessionId: "sess_1", jti: "jti_1" });
    const payload = verifyRefreshToken(token);
    expect(payload.userId).toBe(USER_ID);
    expect(payload.sessionId).toBe("sess_1");
    expect(payload.jti).toBe("jti_1");
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ userId: USER_ID }) + "x";
    expect(() => verifyAccessToken(token)).toThrow(ApiError);
    try {
      verifyAccessToken(token);
    } catch (err) {
      expect((err as ApiError).status).toBe(401);
    }
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ userId: USER_ID }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: -60,
    });
    expect(() => verifyAccessToken(expired)).toThrow(ApiError);
  });

  it("uses a 15-minute access TTL", () => {
    const token = signAccessToken({ userId: USER_ID });
    const decoded = jwt.decode(token) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it("hashes refresh tokens before storage", () => {
    const token = signRefreshToken({ userId: USER_ID, sessionId: "s", jti: "j" });
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
