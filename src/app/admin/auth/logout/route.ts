import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { adminRefreshSchema } from "@/modules/admin/admin.validation";
import { adminLogout } from "@/modules/admin/admin.auth.service";
import { requireAdminAuth } from "@/middleware/adminAuth";

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["auth"]);
  const body = validateBody(adminRefreshSchema, await readJsonBody(req));
  await adminLogout(body.refreshToken);
  return new NextResponse(null, { status: 204 });
});
