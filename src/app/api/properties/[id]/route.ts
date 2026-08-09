import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { getProperty, updateProperty } from "@/modules/properties/property.service";
import { patchPropertySchema } from "@/modules/properties/property.validation";
import { ok } from "@/lib/response";

type Params = { params: Promise<{ id: string }> };

/**
 * @swagger
 * /api/properties/{id}:
 *   get:
 *     summary: Get own property
 *     description: Only the owner can read it — foreign/missing ids return an
 *       identical 404 (no existence leak).
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Property
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Not found (or owned by someone else)
 *   patch:
 *     summary: Fill in property steps (progressive draft completion)
 *     description: At least one field required; unknown fields rejected.
 *       verificationStatus can never be changed here.
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ownerName: { type: string, minLength: 1, maxLength: 120 }
 *               propertyType: { type: string, enum: [HOUSE, FLAT, OTHER] }
 *               ownershipType: { type: string, enum: [OWN, RENT, OTHER] }
 *               address: { type: string, minLength: 5, maxLength: 500 }
 *               city: { type: string, minLength: 2, maxLength: 100 }
 *               state: { type: string, minLength: 2, maxLength: 100 }
 *               pincode: { type: string, pattern: '^\d{6}$' }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *     responses:
 *       '200':
 *         description: Updated property
 *       '400':
 *         description: Invalid payload / empty body
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Not found (or owned by someone else)
 */
export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const property = await getProperty(userId, id);
  return ok(property);
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const { userId } = requireAuth(req);
  const { id } = await params;
  const body = validateBody(patchPropertySchema, await readJsonBody(req));
  const property = await updateProperty(userId, id, body);
  return ok(property);
});
