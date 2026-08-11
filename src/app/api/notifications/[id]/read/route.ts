import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { ok } from "@/lib/response";
import { markNotificationRead } from "@/modules/notifications/notifications.service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark one notification as read
 *     description: Owner-only. A foreign or missing id returns an identical 404
 *       (no existence leak). Idempotent — re-reading an already-read
 *       notification still succeeds.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Updated notification
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Notification'
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Notification not found (or owned by someone else)
 */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const result = await markNotificationRead(userId, id);
  return ok(result);
});