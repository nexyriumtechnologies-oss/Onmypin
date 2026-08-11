import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { ok } from "@/lib/response";
import { markAllNotificationsRead } from "@/modules/notifications/notifications.service";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/notifications/read-all:
 *   post:
 *     summary: Mark all of the caller's notifications as read
 *     description: Only the caller's OWN unread notifications are touched.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Updated
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
 *                         updatedCount: { type: integer, description: How many notifications were flipped to read }
 *       '401':
 *         description: Missing or invalid access token
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const result = await markAllNotificationsRead(userId);
  return ok(result);
});