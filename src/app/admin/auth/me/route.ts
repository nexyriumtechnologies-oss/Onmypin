import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminMe } from "@/modules/admin/admin.auth.service";
import { ok } from "@/lib/response";


/**
 * @swagger
 * /admin/auth/me:
 *   get:
 *     summary: Get current admin
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Success
 */\nexport const GET = withErrorHandler(async (req: NextRequest) => {
  const adminCtx = await requireAdminAuth(req, ["auth"]);
  const admin = await adminMe(adminCtx.adminId);
  return ok(admin);
});
