import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { userStatusSchema } from "@/modules/admin/admin.validation";
import { updateAdminUserStatus } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/users/{id}/status:
 *   patch:
 *     summary: Change user status
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
 *               accountStatus: { type: 'string', enum: ['ACTIVE', 'DEACTIVATED'] }
 *     responses:
 *       200:
 *         description: Success
 */\nexport const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["users:manage"]);
  const { id } = await props.params;
  const body = validateBody(userStatusSchema, await readJsonBody(req));
  const updated = await updateAdminUserStatus(id, body.accountStatus);
  return ok(updated);
});
