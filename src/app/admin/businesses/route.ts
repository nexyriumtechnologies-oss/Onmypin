import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminBusinessesQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminBusinesses } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["business:read"]);
  const query = parseQueryParams(req, adminBusinessesQuerySchema);
  const result = await listAdminBusinesses(query);
  return ok(result);
});
