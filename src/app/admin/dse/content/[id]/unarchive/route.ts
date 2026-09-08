import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { ok } from "@/lib/response";
import { unarchiveAdminDseContent } from "@/modules/dse/dse.service";

type IdParams = { params: Promise<{ id: string }> };


/**
 * @swagger
 * /admin/dse/content/{id}/unarchive:
 *   post:
 *     summary: Unarchive DSE content
 *     description: >-
 *       Moves ARCHIVED content back to DRAFT for editing or re-publishing.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Content back in DRAFT
 *       '400':
 *         description: Content is not archived
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
  return ok(await unarchiveAdminDseContent(id, adminId));
});
