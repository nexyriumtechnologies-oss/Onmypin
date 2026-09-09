import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, z } from "zod";
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

/**
 * Transient Prisma failures that are safe for the client to retry.
 * P2028 = interactive transaction expired/closed; P1001/P1017/P2024 =
 * unreachable database / pool timeout. Without this mapping they surface
 * as the generic 500 "Something went wrong".
 */
function prismaRetryableKind(err: unknown): "TX_EXPIRED" | "DB_UNREACHABLE" | null {
  const code =
    typeof err === "object" && err !== null ? (err as { code?: unknown }).code : null;
  if (code === "P2028") return "TX_EXPIRED";
  if (code === "P1001" || code === "P1017" || code === "P2024") return "DB_UNREACHABLE";
  return null;
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
      const retryable = !(err instanceof ApiError) && !(err instanceof ZodError)
        ? prismaRetryableKind(err)
        : null;
      const status =
        err instanceof ApiError ? err.status
        : err instanceof ZodError ? 400
        : retryable ? 503
        : 500;
      const code =
        err instanceof ApiError ? err.code
        : err instanceof ZodError ? "VALIDATION_ERROR"
        : retryable === "TX_EXPIRED" ? "TRANSACTION_TIMEOUT"
        : retryable === "DB_UNREACHABLE" ? "DATABASE_UNAVAILABLE"
        : "INTERNAL_SERVER_ERROR";

      const message =
        err instanceof ApiError ? err.message
        : err instanceof ZodError ? "Invalid request payload"
        : retryable === "TX_EXPIRED" ? "Database transaction timed out — safe to retry"
        : retryable === "DB_UNREACHABLE" ? "Database temporarily unavailable — retry shortly"
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
export function validateBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
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
