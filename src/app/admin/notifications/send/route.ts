import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { broadcastSendSchema } from "@/modules/admin/admin.validation";
import { sendAdminBroadcast } from "@/modules/admin/admin.service";
import { created } from "@/lib/response";

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["notify:broadcast"]);
  const body = validateBody(broadcastSendSchema, await readJsonBody(req));
  const broadcast = await sendAdminBroadcast(body);
  return created(broadcast);
});
