import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { getAdminDashboardStats } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["dashboard"]);
  const stats = await getAdminDashboardStats();
  return ok(stats);
});
