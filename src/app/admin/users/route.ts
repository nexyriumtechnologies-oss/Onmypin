import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminUsersQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminUsers } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["users:read"]);
  const query = parseQueryParams(req, adminUsersQuerySchema);
  const result = await listAdminUsers(query);
  return ok(result);
});
