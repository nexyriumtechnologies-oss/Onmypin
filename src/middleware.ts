import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS enforcement: origins come from CORS_ALLOWED_ORIGINS (comma-separated),
 * never "*". Non-browser clients (Flutter app) send no Origin header and are
 * not restricted. Browser origins not on the allowlist get a 403.
 */
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  // Not a browser request (curl, Flutter, server-to-server) — no Origin to check.
  if (!origin) return NextResponse.next();

  if (!allowedOrigins.has(origin)) {
    return NextResponse.json(
      { success: false, error: { code: "CORS_DENIED", message: "Origin not allowed" } },
      { status: 403 },
    );
  }

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  for (const [key, value] of headers.entries()) res.headers.set(key, value);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
