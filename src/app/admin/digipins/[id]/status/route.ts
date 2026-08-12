import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { digipinStatusSchema } from "@/modules/admin/admin.validation";
import { updateAdminDigipinStatus } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";

export const PATCH = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["digipin:status"]);
  const { id } = await props.params;
  const body = validateBody(digipinStatusSchema, await readJsonBody(req));
  const updated = await updateAdminDigipinStatus(id, body.status);
  return ok(updated);
});
