import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminUpdateSchema } from "@/modules/admin/admin.validation";
import { updateAdmin } from "@/modules/admin/admin.auth.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/admins/{id}:
 *   patch:
 *     summary: Update admin
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role: { type: 'string' }
 *               isActive: { type: 'boolean' }
 *     responses:
 *       200:
 *         description: Updated
 */\nexport const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const adminCtx = await requireAdminAuth(req, ["admins:manage"]);
  const { id } = await props.params;
  const body = validateBody(adminUpdateSchema, await readJsonBody(req));
  const updated = await updateAdmin(id, body, adminCtx.adminId);
  return ok(updated);
});
