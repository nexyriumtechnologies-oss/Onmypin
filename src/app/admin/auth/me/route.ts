import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminMe } from "@/modules/admin/admin.auth.service";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const adminCtx = await requireAdminAuth(req, ["auth"]);
  const admin = await adminMe(adminCtx.adminId);
  return ok(admin);
});
