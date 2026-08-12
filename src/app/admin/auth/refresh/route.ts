import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { adminRefreshSchema } from "@/modules/admin/admin.validation";
import { adminRefresh } from "@/modules/admin/admin.auth.service";
import { ok } from "@/lib/response";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = validateBody(adminRefreshSchema, await readJsonBody(req));
  const result = await adminRefresh(body.refreshToken);
  return ok(result);
});
