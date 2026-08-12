import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { getAdminPropertyDetail } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/properties/{id}:
 *   get:
 *     summary: Get property details
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'string' }
 *     responses:
 *       200:
 *         description: Success
 */\nexport const GET = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["property:read"]);
  const { id } = await props.params;
  const detail = await getAdminPropertyDetail(id);
  return ok(detail);
});
