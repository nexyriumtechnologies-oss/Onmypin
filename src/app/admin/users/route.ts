import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminUsersQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminUsers } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: List users
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
  await requireAdminAuth(req, ["users:read"]);
  const query = parseQueryParams(req, adminUsersQuerySchema);
  const result = await listAdminUsers(query);
  return ok(result);
});
