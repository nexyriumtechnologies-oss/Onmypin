import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { ok } from "@/lib/response";
import { archiveAdminDseContent } from "@/modules/dse/dse.service";

type IdParams = { params: Promise<{ id: string }> };


/**
 * @swagger
 * /admin/dse/content/{id}/archive:
 *   post:
 *     summary: Archive DSE content
 *     description: >-
 *       Sets status ARCHIVED — retained for admin purposes, excluded from
 *       public listings. Reversible via unarchive (returns to DRAFT).
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Archived content
 *       '400':
 *         description: Already archived
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
  return ok(await archiveAdminDseContent(id, adminId));
});
