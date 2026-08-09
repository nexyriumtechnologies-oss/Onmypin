import { NextResponse } from "next/server";
import { getOpenApiSpec } from "@/lib/openapi";

export const runtime = "nodejs";

/** GET /api/openapi.json — the generated OpenAPI 3.0 spec. */
export async function GET() {
  return NextResponse.json(getOpenApiSpec());
}
