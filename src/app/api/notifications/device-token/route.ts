import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { created, noContent } from "@/lib/response";
import { parseQueryParams } from "@/lib/queryParams";
import {
  registerDeviceTokenSchema,
  deviceTokenQuerySchema,
} from "@/modules/notifications/notifications.validation";
import {
  registerDeviceToken,
  removeDeviceToken,
} from "@/modules/notifications/notifications.service";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/notifications/device-token:
 *   post:
 *     summary: Register a push token for the caller
 *     description: Upserts the (user, fcmToken) pair — re-registering the same
 *       token only refreshes its platform. Tokens are only ever used to push
 *       notifications TO the caller; there is no send-to-anyone route.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcmToken, platform]
 *             properties:
 *               fcmToken: { type: string, minLength: 1, maxLength: 512 }
 *               platform: { type: string, enum: [ANDROID, IOS, WEB] }
 *     responses:
 *       '201':
 *         description: Registered
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
 *                         id: { type: string }
 *                         fcmToken: { type: string }
 *                         platform: { type: string }
 *                         createdAt: { type: string, format: date-time }
 *       '400':
 *         description: Invalid payload
 *       '401':
 *         description: Missing or invalid access token
 *   delete:
 *     summary: Remove a push token for the caller (unregister)
 *     description: The token is passed as the `fcmToken` query parameter.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: fcmToken
 *         in: query
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '204':
 *         description: Removed
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Token not registered for this user
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const body = validateBody(registerDeviceTokenSchema, await readJsonBody(req));
  const result = await registerDeviceToken(userId, body.fcmToken, body.platform);
  return created(result);
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const { fcmToken } = parseQueryParams(req, deviceTokenQuerySchema);
  await removeDeviceToken(userId, fcmToken);
  return noContent();
});