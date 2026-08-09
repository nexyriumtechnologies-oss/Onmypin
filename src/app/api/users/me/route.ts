import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { getMe, updateMe, deleteMe } from "@/modules/users/user.service";
import { updateMeSchema } from "@/modules/users/user.validation";
import { ok, noContent } from "@/lib/response";

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get own profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Own profile
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
 *   patch:
 *     summary: Update own profile
  *     description: >-
  *       `profileImage` is a fileId from POST /api/media/profile-image (purpose
  *       PROFILE_IMAGE) — the server verifies ownership and stores the file URL.
  *       Unknown fields are rejected (strict schema).
  *     tags: [Users]
  *     security:
  *       - bearerAuth: []
  *     requestBody:
  *       required: true
  *       content:
  *         application/json:
  *           schema:
  *             type: object
  *             properties:
  *               name: { type: string, minLength: 1, maxLength: 120 }
  *               email: { type: string, format: email, nullable: true }
  *               profileImage:
  *                 type: string
  *                 description: fileId returned by POST /api/media/profile-image
 *               language: { type: string, minLength: 2, maxLength: 10 }
 *               accountStatus: { type: string, enum: [ACTIVE, DEACTIVATED] }
 *     responses:
 *       '200':
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/UserProfile'
 *       '400':
 *         description: Invalid payload or unknown fields
 *       '401':
 *         description: Missing or invalid access token
 *       '403':
 *         description: Account deleted/deactivated
 *   delete:
 *     summary: Soft-delete own account
 *     description: Marks the account DELETED and revokes all sessions/tokens.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '204':
 *         description: Deleted
 *       '401':
 *         description: Missing or invalid access token
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const user = await getMe(userId);
  return ok(user);
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const body = validateBody(updateMeSchema, await readJsonBody(req));
  const user = await updateMe(userId, body);
  return ok(user);
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  await deleteMe(userId);
  return noContent();
});
