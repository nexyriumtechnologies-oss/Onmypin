import type { NextRequest } from "next/server";
import { withErrorHandler } from "@/middleware/errorHandler";
import { requireAuth } from "@/middleware/auth";
import { getTrustScore } from "@/modules/trust-score/trust-score.service";
import { ok } from "@/lib/response";

/**
 * @swagger
 * /api/users/me/trust-score:
 *   get:
 *     summary: Get own trust score and factor breakdown
 *     description: >-
 *       Read-only. The score is derived server-side from verified properties,
 *       verified businesses, media (selfie, profile photo, business photos),
 *       account age and unresolved verification rejections. It is NEVER
 *       client-settable and is re-persisted by the platform only on admin
 *       approve/reject events (Module 7).
 *     tags: [Trust Score]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Own trust score breakdown
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
 *                         score: { type: integer, minimum: 0, maximum: 100 }
 *                         maxScore: { type: integer, example: 100 }
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         factors:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               code: { type: string }
 *                               label: { type: string }
 *                               points: { type: integer }
 *                               units: { type: integer }
 *                               details: { type: string }
 *                               applied: { type: boolean }
 *                         penalties:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               code: { type: string }
 *                               label: { type: string }
 *                               points: { type: integer }
 *                               units: { type: integer }
 *                               applied: { type: boolean }
 *       '401':
 *         description: Missing or invalid access token
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = requireAuth(req);
  const { breakdown } = await getTrustScore(userId);
  return ok(breakdown);
});