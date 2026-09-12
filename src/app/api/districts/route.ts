import type { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler, ApiError } from "@/middleware/errorHandler";
import { getRateLimiter, getClientIp, DSE_PUBLIC_RATE_LIMIT } from "@/lib/rateLimit";
import { parseQueryParams } from "@/lib/queryParams";
import { ok } from "@/lib/response";
import { searchDistricts } from "@/modules/districts/districts";

const districtsQuerySchema = z
  .object({
    state: z.string().max(100).optional(),
    search: z.string().max(100).optional(),
  })
  .strict();

/**
 * @swagger
 * /api/districts:
 *   get:
 *     summary: Look up LGD districts (for district autofill)
 *     description: >-
 *       Public autocomplete pool over the 784 LGD districts. Send `state`
 *       (e.g. "West Bengal") to scope the list, and/or `search` to filter by
 *       name substring. The frontend uses this to fill the `districtCode`
 *       field live as the user types a district name — and the create/PATCH/
 *       submit endpoints accept `districtName` directly and resolve it
 *       server-side the same way. Rate-limited per IP.
 *     tags: [Districts]
 *     parameters:
 *       - name: state
 *         in: query
 *         required: false
 *         schema: { type: string, maxLength: 100 }
 *         description: State/UT name to scope results (e.g. "West Bengal")
 *       - name: search
 *         in: query
 *         required: false
 *         schema: { type: string, maxLength: 100 }
 *         description: Case-insensitive name substring filter (e.g. "kolk")
 *     responses:
 *       '200':
 *         description: Matching districts sorted by LGD code
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           code: { type: integer, example: 315 }
 *                           name: { type: string, example: "Kolkata" }
 *                           stateShort: { type: string, example: "WB" }
 *                           stateName: { type: string, example: "West Bengal" }
 *       '429':
 *         description: Rate limit exceeded
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const limiter = getRateLimiter();
  const verdict = await limiter.consume(
    `districts:ip:${getClientIp(req.headers)}`,
    DSE_PUBLIC_RATE_LIMIT,
  );
  if (!verdict.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests — slow down and retry.");
  }
  const { state, search } = parseQueryParams(req, districtsQuerySchema);
  return ok(searchDistricts(search, state));
});
