import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminDigipinsQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminDigipins } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/digipins:
 *   get:
 *     summary: List digipins
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
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["digipin:read"]);
  const query = parseQueryParams(req, adminDigipinsQuerySchema);
  const result = await listAdminDigipins(query);
  return ok(result);
});
