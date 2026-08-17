import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { broadcastSendSchema } from "@/modules/admin/admin.validation";
import { sendAdminBroadcast } from "@/modules/admin/admin.service";
import { created } from "@/lib/response";


/**
 * @swagger
 * /admin/notifications/send:
 *   post:
 *     summary: Broadcast notification
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target: { type: 'string', enum: ['ALL', 'USER', 'SEGMENT'] }
 *               userId: { type: 'string' }
 *               segment: { type: 'string' }
 *               title: { type: 'string' }
 *               message: { type: 'string' }
 *               type: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["notify:broadcast"]);
  const body = validateBody(broadcastSendSchema, await readJsonBody(req));
  const broadcast = await sendAdminBroadcast(body);
  return created(broadcast);
});
