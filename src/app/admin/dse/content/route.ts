import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAdminAuth } from "@/middleware/adminAuth";
import { parseQueryParams } from "@/lib/queryParams";
import { ok, created } from "@/lib/response";
import {
  adminDseContentQuerySchema,
  dseContentCreateSchema,
} from "@/modules/dse/dse.validation";
import { createAdminDseContent, listAdminDseContent } from "@/modules/dse/dse.service";


/**
 * @swagger
 * /admin/dse/content:
 *   get:
 *     summary: List DSE content (all statuses)
 *     description: >-
 *       Admin listing across DRAFT/PUBLISHED/UNPUBLISHED/ARCHIVED with search
 *       (title, short description, body, category name), filters, date range
 *       and sorting. Soft-deleted rows are excluded.
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: pageSize
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - name: status
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [DRAFT, PUBLISHED, UNPUBLISHED, ARCHIVED] }
 *       - name: contentType
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [NEWS, GOVERNMENT_UPDATE, PUBLIC_INFORMATION, ANNOUNCEMENT, AWARENESS, EDUCATIONAL_ARTICLE] }
 *       - name: categoryId
 *         in: query
 *         required: false
 *         schema: { type: string }
 *       - name: isFeatured
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [true, false] }
 *       - name: isPinned
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [true, false] }
 *       - name: search
 *         in: query
 *         required: false
 *         schema: { type: string, maxLength: 200 }
 *       - name: fromDate
 *         in: query
 *         required: false
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         required: false
 *         schema: { type: string, format: date-time }
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [createdAt, updatedAt, publishedAt, title], default: createdAt }
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       '200':
 *         description: Paginated content
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminAuth(req, ["content:manage"]);
  const query = parseQueryParams(req, adminDseContentQuerySchema);
  const result = await listAdminDseContent(query);
  return ok(result);
});

/**
 * @swagger
 * /admin/dse/content:
 *   post:
 *     summary: Create DSE content
 *     description: >-
 *       Creates content as DRAFT (or directly PUBLISHED). The slug is
 *       auto-generated from the title with collision suffixes, and the HTML
 *       body is sanitized before storage. Optional `images` replaces the
 *       dse_media set (images only for MVP).
 *     tags: [Admin]
 *     security: [{ adminBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, contentType, categoryId]
 *             properties:
 *               title: { type: string, minLength: 5, maxLength: 200 }
 *               shortDescription: { type: string, maxLength: 500 }
 *               description: { type: string, description: 'HTML article body (sanitized)' }
 *               contentType: { type: string, enum: [NEWS, GOVERNMENT_UPDATE, PUBLIC_INFORMATION, ANNOUNCEMENT, AWARENESS, EDUCATIONAL_ARTICLE] }
 *               categoryId: { type: string }
 *               thumbnailUrl: { type: string, format: uri }
 *               coverImageUrl: { type: string, format: uri }
 *               externalUrl: { type: string, format: uri }
 *               authorName: { type: string, maxLength: 120 }
 *               sourceName: { type: string, maxLength: 200 }
 *               sourceUrl: { type: string, format: uri }
 *               isFeatured: { type: boolean }
 *               isPinned: { type: boolean }
 *               status: { type: string, enum: [DRAFT, PUBLISHED], default: DRAFT }
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
 *       '201':
 *         description: Content created
 *       '400':
 *         description: Invalid payload, inactive category, or empty-after-sanitize body
 *       '401':
 *         description: Missing or invalid admin token
 *       '403':
 *         description: Admin lacks the content:manage capability
 *       '404':
 *         description: Category not found
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { adminId } = await requireAdminAuth(req, ["content:manage"]);
  const body = validateBody(dseContentCreateSchema, await readJsonBody(req));
  const content = await createAdminDseContent(adminId, body);
  return created(content);
});
