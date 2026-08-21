/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * Failures here crash the server loudly instead of degrading at runtime.
 */
import { assertSecureEnv } from "@/lib/env";

export async function register() {
  // Skip during `next build` — secrets are a RUNTIME concern, not a build concern.
  // NEXT_PHASE is "phase-production-build" during `next build`,
  // and "phase-production-server" during `next start`.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  assertSecureEnv();
}
