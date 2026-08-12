import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminSubscriptionsQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminSubscriptions } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/subscriptions:
 *   get:
 *     summary: List subscriptions
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
  await requireAdminAuth(req, ["finance:view"]);
  const query = parseQueryParams(req, adminSubscriptionsQuerySchema);
  const result = await listAdminSubscriptions(query);
  return ok(result);
});
