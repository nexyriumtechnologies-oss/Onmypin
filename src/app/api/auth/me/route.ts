import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { getMe } from "@/modules/users/user.service";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get the current user profile
 *     description: Shortcut for GET /api/users/me using the access token.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/UserProfile'
 *       '401':
 *         description: Missing or invalid access token
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const user = await getMe(userId);
  return ok(user);
});
