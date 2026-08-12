import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminNotificationsQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminBroadcasts } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/notifications:
 *   get:
 *     summary: List broadcast history
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       200:
 *         description: Paginated list
 */\nexport const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["notify:broadcast"]);
  const query = parseQueryParams(req, adminNotificationsQuerySchema);
  const result = await listAdminBroadcasts(query.page, query.pageSize);
  return ok(result);
});
