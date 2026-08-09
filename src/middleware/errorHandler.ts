import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { logger } from "@/lib/logger";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type RouteHandler<TContext = unknown> = (
  req: NextRequest,
  context: TContext,
) => Promise<NextResponse>;

/**
 * Wraps a route handler with centralized error handling + request logging.
 * Consistent error shape: { success: false, error: { code, message } }
 */
export function withErrorHandler<TContext = unknown>(
  handler: RouteHandler<TContext>,
): RouteHandler<TContext> {
  return async (req, context) => {
    const startedAt = Date.now();
    try {
      const res = await handler(req, context);
      logger.info(`${req.method} ${req.nextUrl.pathname} -> ${res.status}`, {
        durationMs: Date.now() - startedAt,
        method: req.method,
        path: req.nextUrl.pathname,
      });
      return res;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      const code =
        err instanceof ApiError
          ? err.code
          : err instanceof ZodError
            ? "VALIDATION_ERROR"
            : "INTERNAL_SERVER_ERROR";

      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof ZodError
            ? "Invalid request payload"
            : "Something went wrong";

      if (!(err instanceof ApiError) && !(err instanceof ZodError)) {
        logger.error(`Unhandled error on ${req.method} ${req.nextUrl.pathname}`, {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          path: req.nextUrl.pathname,
        });
      }

      return NextResponse.json(
        { success: false, error: { code, message } },
        { status },
      );
    }
  };
}

/** Parse + validate JSON body, throwing a 400 ApiError on failure. */
export async function readJsonBody<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

/** Run a Zod schema against the body; on failure throw 400 with field details. */
export function validateBody<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `Invalid request payload: ${JSON.stringify(details)}`,
      );
    }
    throw err;
  }
}
