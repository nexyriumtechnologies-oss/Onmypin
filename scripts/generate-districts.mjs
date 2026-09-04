/**
 * Generates src/modules/districts/districts.generated.ts from
 * data/india_districts_lgd.csv (LGD district codes).
 *
 * State shortforms are resolved through src/modules/digipin/stateCodes.ts
 * (parsed, not imported — this script runs on plain node). Any CSV state
 * name without a shortform mapping fails the build loudly.
 *
 * Usage: npm run districts:generate
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. Load STATE_CODES from the TS source (quoted + bare keys) ----
const stateCodesSrc = readFileSync(join(root, "src/modules/digipin/stateCodes.ts"), "utf8");
const STATE_CODES = {};
const kvRe = /^\s*(?:"([^"]+)"|([A-Za-z ]+))\s*:\s*"([A-Z]{2})"/gm;
let m;
while ((m = kvRe.exec(stateCodesSrc)) !== null) {
  STATE_CODES[(m[1] ?? m[2]).toLowerCase()] = m[3];
}

// ---- 2. Parse the CSV ----
const csv = readFileSync(join(root, "data/india_districts_lgd.csv"), "utf8").replace(/^\uFEFF/, "");
const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = lines[0].split(",").map((h) => h.trim());
const idx = {
  stateCode: header.indexOf("state_code"),
  stateName: header.indexOf("state_name"),
  districtCode: header.indexOf("district_code"),
  districtName: header.indexOf("district_name"),
};
if (Object.values(idx).some((i) => i < 0)) {
  throw new Error(`Unexpected CSV header: ${lines[0]}`);
}

const districts = [];
const unmappedStates = new Set();
for (const line of lines.slice(1)) {
  const cols = line.split(",");
  if (cols.length !== 4) throw new Error(`Malformed CSV row (expected 4 cols): ${line}`);
  const stateName = cols[idx.stateName].trim();
  const districtCode = Number(cols[idx.districtCode].trim());
  const districtName = cols[idx.districtName].trim();
  if (!Number.isInteger(districtCode) || districtCode <= 0) {
    throw new Error(`Bad district code in row: ${line}`);
  }
  const stateShort = STATE_CODES[stateName.toLowerCase()];
  if (!stateShort) {
    unmappedStates.add(stateName);
    continue;
  }
  districts.push({ code: districtCode, name: districtName, stateName, stateShort });
}
if (unmappedStates.size > 0) {
  throw new Error(
    `No state shortform mapping for CSV states: ${[...unmappedStates].join(", ")}. ` +
      `Add aliases to src/modules/digipin/stateCodes.ts, then re-run.`,
  );
}

const seen = new Set();
for (const d of districts) {
  if (seen.has(d.code)) throw new Error(`Duplicate district code in CSV: ${d.code}`);
  seen.add(d.code);
}
districts.sort((a, b) => a.code - b.code);

// ---- 3. Emit the generated module ----
const esc = (s) => JSON.stringify(s);
const entries = districts
  .map(
    (d) =>
      `  ${d.code}: { code: ${d.code}, name: ${esc(d.name)}, stateName: ${esc(d.stateName)}, stateShort: ${esc(d.stateShort)} },`,
  )
  .join("\n");

const out = `/**
 * GENERATED — do not edit by hand.
 * Source: data/india_districts_lgd.csv (LGD codes).
 * Regenerate: npm run districts:generate
 * Entries: ${districts.length}
 */
export interface DistrictInfo {
  code: number;
  name: string;
  stateName: string;
  stateShort: string;
}

/** LGD district code → info. Codes are globally unique across states. */
export const DISTRICTS: Record<number, DistrictInfo> = {
${entries}
};

export const DISTRICT_COUNT = ${districts.length};
`;

const outDir = join(root, "src/modules/districts");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "districts.generated.ts"), out);
console.log(`Wrote ${districts.length} districts to src/modules/districts/districts.generated.ts`);
