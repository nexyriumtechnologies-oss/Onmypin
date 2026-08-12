import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { propertyVerificationSchema } from "@/modules/admin/admin.validation";
import { verifyAdminProperty } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";

export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["property:verify"]);
  const { id } = await props.params;
  const body = validateBody(propertyVerificationSchema, await readJsonBody(req));
  const updated = await verifyAdminProperty(id, body.action, body.reason);
  return ok(updated);
});
