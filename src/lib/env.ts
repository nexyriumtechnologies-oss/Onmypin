/**
 * Startup environment validation — the server REFUSES to boot when a
 * security-critical secret is missing, too short, or duplicated.
 * Runs via Next.js instrumentation (register) on server start.
 */
export function assertSecureEnv(): void {
  const required = [
    { name: "JWT_ACCESS_SECRET", min: 32 },
    { name: "JWT_REFRESH_SECRET", min: 32 },
    { name: "OTP_HASH_SALT", min: 16 },
    { name: "ADMIN_JWT_SECRET", min: 32 },
  ] as const;

  const failures: string[] = [];
  for (const { name, min } of required) {
    const value = process.env[name];
    if (!value) {
      failures.push(`${name} is missing`);
    } else if (value.length < min) {
      failures.push(`${name} must be at least ${min} characters`);
    }
  }

  const access = process.env.JWT_ACCESS_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;
  const admin = process.env.ADMIN_JWT_SECRET;
  if (access && refresh && access === refresh) {
    failures.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different secrets");
  }
  if (admin && (admin === access || admin === refresh)) {
    failures.push("ADMIN_JWT_SECRET must be different from the user-app JWT secrets");
  }

  const placeholder = (v: string | undefined) => v === "change-me";
  if (placeholder(access) || placeholder(refresh) || placeholder(process.env.OTP_HASH_SALT)) {
    failures.push("change-me placeholder secrets are not allowed");
  }

  if (failures.length > 0) {
    throw new Error(
      `FATAL: insecure environment configuration — server will not start:\n  - ${failures.join("\n  - ")}`,
    );
  }
}
