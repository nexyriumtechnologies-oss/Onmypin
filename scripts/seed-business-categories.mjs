/**
 * Seeds the BusinessCategory tree with a starter set of active categories.
 * Idempotent — categories are matched by name and only created when missing.
 *
 * Usage: npm run seed:categories
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
  {
    name: "Food & Dining",
    subcategories: ["Restaurant", "Cafe", "Bakery", "Sweet Shop", "Food Truck"],
  },
  {
    name: "Health & Beauty",
    subcategories: ["Clinic", "Pharmacy", "Salon", "Gym", "Spa"],
  },
  {
    name: "Retail & Shopping",
    subcategories: ["Grocery", "Clothing", "Electronics", "Furniture", "Book Store"],
  },
  {
    name: "Services",
    subcategories: ["Repair", "Cleaning", "Courier", "Legal", "Accounting", "Real Estate"],
  },
  {
    name: "Education",
    subcategories: ["School", "Coaching", "Tutorial", "Daycare"],
  },
  {
    name: "Transport",
    subcategories: ["Auto Rickshaw", "Taxi", "Courier"],
  },
];

async function seed() {
  let order = 0;
  let created = 0;
  for (const cat of CATEGORIES) {
    let parent = await prisma.businessCategory.findFirst({ where: { name: cat.name } });
    if (!parent) {
      parent = await prisma.businessCategory.create({
        data: { name: cat.name, order: order++, isActive: true },
      });
      created++;
    }
    let subOrder = 0;
    for (const sub of cat.subcategories) {
      const exists = await prisma.businessCategory.findFirst({ where: { name: sub } });
      if (!exists) {
        await prisma.businessCategory.create({
          data: { name: sub, parentId: parent.id, order: subOrder++, isActive: true },
        });
        created++;
      }
    }
  }
  console.log(`Done — ${created} category row(s) created.`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
