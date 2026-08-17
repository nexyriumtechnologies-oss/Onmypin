import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { adminRefreshSchema } from "@/modules/admin/admin.validation";
import { adminLogout } from "@/modules/admin/admin.auth.service";
import { requireAdminAuth } from "@/middleware/adminAuth";


/**
 * @swagger
 * /admin/auth/logout:
 *   post:
 *     summary: Admin logout
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: 'string' }
 *     responses:
 *       204:
 *         description: Success
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["auth"]);
  const body = validateBody(adminRefreshSchema, await readJsonBody(req));
  await adminLogout(body.refreshToken);
  return new NextResponse(null, { status: 204 });
});
