import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { refreshTokenSchema } from "@/modules/auth/auth.validation";
import { rotateRefreshToken } from "@/modules/auth/session.service";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Rotate the refresh token
 *     description: Presents the current refresh token and receives a fresh
 *       pair. The presented token is revoked. Reuse of an already-rotated
 *       token revokes the ENTIRE session family and returns a generic 401
 *       (no reuse/expiry/invalid leak).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       '200':
 *         description: New token pair
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         accessToken: { type: string }
 *                         refreshToken: { type: string }
 *       '401':
 *         description: Invalid, expired, or reused refresh token (generic)
 *       '403':
 *         description: Account not active
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(refreshTokenSchema, await readJsonBody(req));
  const tokens = await rotateRefreshToken(body.refreshToken);
  return ok(tokens);
});
