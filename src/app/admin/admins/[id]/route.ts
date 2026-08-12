import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { adminUpdateSchema } from "@/modules/admin/admin.validation";
import { updateAdmin } from "@/modules/admin/admin.auth.service";
import { ok } from "@/lib/response";

export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const adminCtx = await requireAdminAuth(req, ["admins:manage"]);
  const { id } = await props.params;
  const body = validateBody(adminUpdateSchema, await readJsonBody(req));
  const updated = await updateAdmin(id, body, adminCtx.adminId);
  return ok(updated);
});
