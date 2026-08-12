import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { userStatusSchema } from "@/modules/admin/admin.validation";
import { updateAdminUserStatus } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";

export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["users:manage"]);
  const { id } = await props.params;
  const body = validateBody(userStatusSchema, await readJsonBody(req));
  const updated = await updateAdminUserStatus(id, body.accountStatus);
  return ok(updated);
});
