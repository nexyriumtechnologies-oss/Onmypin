import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminCreateSchema } from "@/modules/admin/admin.validation";
import { createAdmin, listAdmins } from "@/modules/admin/admin.auth.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok, created } from "@/lib/response";
import { z } from "zod";

const adminsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});


/**
 * @swagger
 * /admin/admins:
 *   get:
 *     summary: List admins
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
 *         description: Paginated list of admins
 */\nexport const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["admins:manage"]);
  const query = parseQueryParams(req, adminsQuerySchema);
  const result = await listAdmins(query.page, query.pageSize);
  return ok(result);
});


export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["admins:manage"]);
  const body = validateBody(adminCreateSchema, await readJsonBody(req));
  const newAdmin = await createAdmin({
    email: body.email,
    password: body.tempPassword,
    name: body.name,
    role: body.role,
  });
  return created(newAdmin);
});
