import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { refreshTokenSchema } from "@/modules/auth/auth.validation";
import { logout } from "@/modules/auth/session.service";
import { requireAuth } from "@/middleware/auth";
import { noContent } from "@/lib/response";

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out (revoke the session)
 *     description: Requires a valid access token; revokes the presented refresh
 *       token and deletes its session row.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
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
 *       '204':
 *         description: Logged out
 *       '401':
 *         description: Missing/invalid access token or refresh token
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const body = validateBody(refreshTokenSchema, await readJsonBody(req));
  await logout(body.refreshToken, userId);
  return noContent();
});
