import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { ok, created } from "@/lib/response";
import { parseQueryParams } from "@/lib/queryParams";
import {
  paginationParamsSchema,
  recordSearchSchema,
} from "@/modules/search/search.validation";
import { listSearchHistory, recordSearch } from "@/modules/search/search.service";

/**
 * @swagger
 * /api/search/history:
 *   get:
 *     summary: The authenticated user's recent searches (paginated)
 *     description: Newest first; pruned to the last 50 searches per user.
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: pageSize
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       '200':
 *         description: Search history
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               query: { type: string }
 *                               type: { type: string }
 *                               createdAt: { type: string, format: date-time }
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         pageSize: { type: integer }
 *       '401':
 *         description: Missing or invalid access token
 *   post:
 *     summary: Record a search term against the current user
 *     description: Used by the client to log what the user searched. Prunes the
 *       per-user history to the last 50 entries.
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query: { type: string, minLength: 1, maxLength: 200 }
 *               type: { type: string, enum: [digipin, address, business, all], default: all }
 *     responses:
 *       '201':
 *         description: Recorded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         query: { type: string }
 *                         type: { type: string }
 *                         createdAt: { type: string, format: date-time }
 *       '400':
 *         description: Invalid payload
 *       '401':
 *         description: Missing or invalid access token
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const { page, pageSize } = parseQueryParams(req, paginationParamsSchema);
  const result = await listSearchHistory(userId, page, pageSize);
  return ok(result);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const body = validateBody(recordSearchSchema, await readJsonBody(req));
  const result = await recordSearch(userId, body.query, body.type);
  return created(result);
});
