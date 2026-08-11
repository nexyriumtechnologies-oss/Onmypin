import { NextRequest } from "next/server";
import { type ZodTypeAny, z } from "zod";
import { validateBody } from "@/middleware/errorHandler";

/**
 * Converts URL query params into a plain object and runs it through a Zod
 * schema (coerced number defaults handle missing keys). 400 VALIDATION_ERROR
 * on unknown/out-of-range params, matching the body-validation behavior.
 */
export function parseQueryParams<S extends ZodTypeAny>(req: NextRequest, schema: S): z.output<S> {
  const params: Record<string, string> = {};
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    params[key] = value;
  }
  return validateBody(schema, params);
}
