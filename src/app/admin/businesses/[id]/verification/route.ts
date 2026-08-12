import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { businessVerificationSchema } from "@/modules/admin/admin.validation";
import { verifyAdminBusiness } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";

export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["business:verify"]);
  const { id } = await props.params;
  const body = validateBody(businessVerificationSchema, await readJsonBody(req));
  const updated = await verifyAdminBusiness(id, body.action, body.reason);
  return ok(updated);
});
