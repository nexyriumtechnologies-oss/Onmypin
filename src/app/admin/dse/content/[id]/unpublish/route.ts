import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { ok } from "@/lib/response";
import { unpublishAdminDseContent } from "@/modules/dse/dse.service";

type IdParams = { params: Promise<{ id: string }> };


/**
 * @swagger
 * /admin/dse/content/{id}/unpublish:
 *   post:
 *     summary: Unpublish DSE content
 *     description: >-
 *       Sets status UNPUBLISHED — the content immediately disappears from the
 *       public APIs while remaining editable as a draft-equivalent.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Unpublished content
 *       '400':
 *         description: Content is not published
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
  return ok(await unpublishAdminDseContent(id, adminId));
});
