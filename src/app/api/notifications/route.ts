import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { ok } from "@/lib/response";
import { parseQueryParams } from "@/lib/queryParams";
import { notificationsListQuerySchema } from "@/modules/notifications/notifications.validation";
import { listNotifications } from "@/modules/notifications/notifications.service";

export const runtime = "nodejs";

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: List the caller's in-app notifications (paginated)
 *     description: >-
 *       Newest first, scoped to the authenticated user. An unread tally is
 *       included so the client can badge the bell icon without a second
 *       request. The `filter` parameter narrows to read/unread (default: all).
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: filter
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [all, read, unread], default: all }
 *       - name: page
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: pageSize
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       '200':
 *         description: Paginated notifications
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
 *                         items:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Notification'
 *                         total: { type: integer }
 *                         unread: { type: integer }
 *                         page: { type: integer }
 *                         pageSize: { type: integer }
 *       '401':
 *         description: Missing or invalid access token
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const { filter, page, pageSize } = parseQueryParams(req, notificationsListQuerySchema);
  const result = await listNotifications(userId, page, pageSize, filter);
  return ok(result);
});