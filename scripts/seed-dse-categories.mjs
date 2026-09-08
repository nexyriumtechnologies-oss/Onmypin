/**
 * Seeds the DseCategory table with the starter set from the DSE spec.
 * Idempotent — categories are matched by slug and only created when missing.
 *
 * Usage: npm run seed:dse-categories
 *
 * Works both locally (loads .env if present) and on a platform like Render
 * where env vars are injected directly into the process environment.
 */
import { existsSync, readFileSync } from "node:fs";
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

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: "Government Schemes", description: "Central and state government welfare schemes" },
  { name: "Education", description: "Education updates, exams and scholarships" },
  { name: "Employment", description: "Jobs, recruitment and livelihood updates" },
  { name: "Agriculture", description: "Farming schemes, weather and mandi updates" },
  { name: "Public Safety", description: "Safety advisories and emergency information" },
  { name: "Awareness", description: "Awareness campaigns and social initiatives" },
  { name: "General", description: "General public information and announcements" },
];

function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "category"
  );
}

async function seed() {
  let created = 0;
  let order = 0;
  for (const cat of CATEGORIES) {
    const slug = slugify(cat.name);
    const existing = await prisma.dseCategory.findUnique({ where: { slug } });
    if (!existing) {
      await prisma.dseCategory.create({
        data: { name: cat.name, slug, description: cat.description, sortOrder: order, isActive: true },
      });
      created++;
    }
    order++;
  }
  console.log(`Done — ${created} DSE category row(s) created.`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
