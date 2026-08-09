import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { ApiError, withErrorHandler } from "@/middleware/errorHandler";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/** Whitelisted swagger-ui-dist assets — never serve arbitrary paths. */
const ASSETS: Record<string, string> = {
  "swagger-ui.css": "text/css; charset=utf-8",
  "swagger-ui-bundle.js": "application/javascript; charset=utf-8",
  "swagger-ui-standalone-preset.js": "application/javascript; charset=utf-8",
};

type Params = { params: Promise<{ name: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Params) => {
  const { name } = await params;
  const contentType = ASSETS[name];
  if (!contentType) {
    throw new ApiError(404, "ASSET_NOT_FOUND", "Unknown asset");
  }
  const file = await readFile(join(process.cwd(), "node_modules/swagger-ui-dist", name));
  return new NextResponse(file, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
  });
});
