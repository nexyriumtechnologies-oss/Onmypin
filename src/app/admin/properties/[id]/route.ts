import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { getAdminPropertyDetail } from "@/modules/admin/admin.service";
import { ok } from "@/lib/response";

export const GET = withErrorHandler(async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  await requireAdminAuth(req, ["property:read"]);
  const { id } = await props.params;
  const detail = await getAdminPropertyDetail(id);
  return ok(detail);
});
