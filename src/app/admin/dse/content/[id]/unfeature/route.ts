import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { ok } from "@/lib/response";
import { setAdminDseFeatured } from "@/modules/dse/dse.service";

type IdParams = { params: Promise<{ id: string }> };


/**
 * @swagger
 * /admin/dse/content/{id}/unfeature:
 *   post:
 *     summary: Unfeature DSE content
 *     description: Sets is_featured false.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Unfeatured content
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Content not found
 */
export const POST = withErrorHandler(async (req: NextRequest, props: IdParams) => {
  const { adminId } = await requireAdminAuth(req, ["content:manage"]);
  const { id } = await props.params;
  return ok(await setAdminDseFeatured(id, adminId, false));
});
