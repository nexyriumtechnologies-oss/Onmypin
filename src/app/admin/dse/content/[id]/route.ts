import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { ok } from "@/lib/response";
import { dseContentUpdateSchema } from "@/modules/dse/dse.validation";
import {
  deleteAdminDseContent,
  getAdminDseContent,
  updateAdminDseContent,
} from "@/modules/dse/dse.service";

type IdParams = { params: Promise<{ id: string }> };


/**
 * @swagger
 * /admin/dse/content/{id}:
 *   get:
 *     summary: Get single DSE content (admin view)
 *     description: >-
 *       Full content info: body, category, images, status, source, publishing
 *       info, creator and last updater. Any status; soft-deleted rows 404.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Content detail
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Content not found
 */
export const GET = withErrorHandler(async (req: NextRequest, props: IdParams) => {
  await requireAdminAuth(req, ["content:manage"]);
  const { id } = await props.params;
  return ok(await getAdminDseContent(id));
});

/**
 * @swagger
 * /admin/dse/content/{id}:
 *   patch:
 *     summary: Update DSE content
 *     description: >-
 *       Partial update — any subset of fields. `status` cannot be set here;
 *       lifecycle moves only through publish/unpublish/archive endpoints.
 *       The slug stays stable when the title changes.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, minLength: 5, maxLength: 200 }
 *               shortDescription: { type: string, maxLength: 500, nullable: true }
 *               description: { type: string }
 *               contentType: { type: string, enum: [NEWS, GOVERNMENT_UPDATE, PUBLIC_INFORMATION, ANNOUNCEMENT, AWARENESS, EDUCATIONAL_ARTICLE] }
 *               categoryId: { type: string }
 *               thumbnailUrl: { type: string, format: uri, nullable: true }
 *               coverImageUrl: { type: string, format: uri, nullable: true }
 *               externalUrl: { type: string, format: uri, nullable: true }
 *               authorName: { type: string, maxLength: 120, nullable: true }
 *               sourceName: { type: string, maxLength: 200, nullable: true }
 *               sourceUrl: { type: string, format: uri, nullable: true }
 *               isFeatured: { type: boolean }
 *               isPinned: { type: boolean }
 *               images:
 *                 type: array
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   required: [url]
 *                   properties:
 *                     url: { type: string, format: uri }
 *                     fileName: { type: string }
 *                     mimeType: { type: string }
 *                     fileSize: { type: integer }
 *                     sortOrder: { type: integer }
 *     responses:
 *       '200':
 *         description: Updated content
 *       '400':
 *         description: Invalid payload or inactive category
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Content or category not found
 */
export const PATCH = withErrorHandler(async (req: NextRequest, props: IdParams) => {
  const { adminId } = await requireAdminAuth(req, ["content:manage"]);
  const { id } = await props.params;
  const body = validateBody(dseContentUpdateSchema, await readJsonBody(req));
  return ok(await updateAdminDseContent(id, adminId, body));
});

/**
 * @swagger
 * /admin/dse/content/{id}:
 *   delete:
 *     summary: Soft-delete DSE content
 *     description: >-
 *       Sets deleted_at — the row is retained and disappears from admin
 *       listings and public APIs immediately. Never hard-deleted.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Deletion marker
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Content not found
 */
export const DELETE = withErrorHandler(async (req: NextRequest, props: IdParams) => {
  const { adminId } = await requireAdminAuth(req, ["content:manage"]);
  const { id } = await props.params;
  return ok(await deleteAdminDseContent(id, adminId));
});
