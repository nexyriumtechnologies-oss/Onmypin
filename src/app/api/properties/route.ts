import type { NextRequest } from "next/server";
import { withErrorHandler, readJsonBody, validateBody } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { createProperty, listUserProperties } from "@/modules/properties/property.service";
import { createPropertySchema } from "@/modules/properties/property.validation";
import { created, ok } from "@/lib/response";

/**
 * @swagger
 * /api/properties:
 *   post:
 *     summary: Create a property (DRAFT)
 *     description: Creates a draft owned by the caller; later steps are filled
 *       via PATCH /api/properties/{id}.
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ownerName, propertyType, ownershipType]
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
 *       '201':
 *         description: Draft created
 *       '400':
 *         description: Invalid payload
 *       '401':
 *         description: Missing or invalid access token
 *   get:
 *     summary: List own properties
 *     tags: [Properties]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Own properties, newest first
 *       '401':
 *         description: Missing or invalid access token
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const body = validateBody(createPropertySchema, await readJsonBody(req));
  const property = await createProperty(userId, body);
  return created(property);
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const properties = await listUserProperties(userId);
  return ok(properties);
});
