import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { created, ok } from "@/lib/response";
import { parseQueryParams } from "@/lib/queryParams";
import { createBusinessSchema, businessesListQuerySchema } from "@/modules/business/business.validation";
import { createBusiness, listMine, listPublicBusinesses } from "@/modules/business/business.service";

/**
 * @swagger
 * /api/businesses:
 *   post:
 *     summary: Create a business (starts PENDING)
 *     description: >-
 *       Creates a business owned by the caller, starting PENDING. Only `name`
 *       is required at creation — address/category/contact/images are completed
 *       via PATCH and uploads before requesting verification.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               categoryId: { type: string }
 *               subcategoryId: { type: string }
 *               address: { type: string, minLength: 5, maxLength: 500 }
 *               city: { type: string, minLength: 2, maxLength: 100 }
 *               state: { type: string, minLength: 2, maxLength: 100 }
 *               pincode: { type: string, pattern: '^\d{6}$' }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               contactPhone: { type: string, example: "+919876543210" }
 *               contactEmail: { type: string, format: email }
 *     responses:
 *       '201':
 *         description: Business created (PENDING)
 *       '400':
 *         description: Invalid payload or unknown category
 *       '401':
 *         description: Missing or invalid access token
 *   get:
 *     summary: Own businesses OR public directory
 *     description: >-
 *       One route, two views. With `?mine=true` + a Bearer token it lists the
 *       caller's businesses (any verification status, full detail). Otherwise it
 *       is the PUBLIC directory — VERIFIED + ACTIVE businesses only, with filters
 *       `q`, `categoryId`, `city`, `state`, and optional radius search via
 *       `lat`/`lng`/`radiusKm`. Directory cards never include contact info.
 *     tags: [Business]
 *     parameters:
 *       - name: mine
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [true, false] }
 *       - name: q
 *         in: query
 *         required: false
 *         schema: { type: string, maxLength: 200 }
 *       - name: categoryId
 *         in: query
 *         required: false
 *         schema: { type: string }
 *       - name: city
 *         in: query
 *         required: false
 *         schema: { type: string }
 *       - name: state
 *         in: query
 *         required: false
 *         schema: { type: string }
 *       - name: lat
 *         in: query
 *         required: false
 *         schema: { type: number, minimum: -90, maximum: 90 }
 *       - name: lng
 *         in: query
 *         required: false
 *         schema: { type: number, minimum: -180, maximum: 180 }
 *       - name: radiusKm
 *         in: query
 *         required: false
 *         schema: { type: number, minimum: 0.1, maximum: 100, default: 5 }
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
 *         description: Businesses
 *       '401':
 *         description: Missing token when mine=true
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const body = validateBody(createBusinessSchema, await readJsonBody(req));
  const business = await createBusiness(userId, body);
  return created(business);
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const params = parseQueryParams(req, businessesListQuerySchema);
  if (params.mine === "true") {
    const { userId } = requireAuth(req);
    const result = await listMine(userId, params.page, params.pageSize);
    return ok(result);
  }
  const result = await listPublicBusinesses(params);
  return ok(result);
});
