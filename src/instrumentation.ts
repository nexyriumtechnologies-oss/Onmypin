/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * Failures here crash the server loudly instead of degrading at runtime.
 */
import { assertSecureEnv } from "@/lib/env";

export async function register() {
  assertSecureEnv();
}
