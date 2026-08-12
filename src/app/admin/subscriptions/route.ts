import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminSubscriptionsQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminSubscriptions } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["finance:view"]);
  const query = parseQueryParams(req, adminSubscriptionsQuerySchema);
  const result = await listAdminSubscriptions(query);
  return ok(result);
});
