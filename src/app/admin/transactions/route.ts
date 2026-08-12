import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminTransactionsQuerySchema } from "@/modules/admin/admin.validation";
import { listAdminTransactions } from "@/modules/admin/admin.service";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["finance:view"]);
  const query = parseQueryParams(req, adminTransactionsQuerySchema);
  const result = await listAdminTransactions(query);
  return ok(result);
});
