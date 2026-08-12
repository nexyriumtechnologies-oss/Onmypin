import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminDigipinsQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminDigipins } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["digipin:read"]);
  const query = parseQueryParams(req, adminDigipinsQuerySchema);
  const result = await listAdminDigipins(query);
  return ok(result);
});
