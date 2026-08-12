/**
 * Seeds the initial SUPER_ADMIN account.
 * Idempotent — checks if the email already exists in AdminUser.
 *
 * Usage: npm run admin:seed
 * Reads ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD from .env or process environment.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

if (existsSync(".env")) {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(".env");
  } else {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trimStart().startsWith("#")) continue;
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  }
}

const email = process.env.ADMIN_SEED_EMAIL || "admin@ownmypin.app";
const password = process.env.ADMIN_SEED_PASSWORD || "Admin@123456";

function hashPassword(pwd) {
  const SCRYPT_N = 16384;
  const SCRYPT_R = 8;
  const SCRYPT_P = 1;
  const KEY_LEN = 64;
  const SALT_LEN = 16;
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(pwd, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

const prisma = new PrismaClient();

async function seed() {
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin account ${email} already exists — skipping seed.`);
    return;
  }

  const passwordHash = hashPassword(password);
  const admin = await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      name: "Super Admin",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log(`Successfully seeded initial SUPER_ADMIN (${admin.email}, id: ${admin.id}).`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
