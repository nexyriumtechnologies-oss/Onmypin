import { DISTRICTS, type DistrictInfo } from "./districts.generated";
import { ApiError } from "@/middleware/errorHandler";
import { getStateCode } from "@/modules/digipin/stateCodes";

export type { DistrictInfo };

/** Look up an LGD district code — codes are globally unique across states. */
export function getDistrict(code: number): DistrictInfo {
  const district = DISTRICTS[code];
  if (!district) {
    throw new ApiError(
      400,
      "INVALID_DISTRICT",
      `Unknown district code: ${code}. Must be a valid LGD district code.`,
    );
  }
  return district;
}

/**
 * Strict cross-check: the district must belong to the given state shortform
 * (e.g. district 602/Mumbai belongs to MH). Catches mismatched state+district
 * pairs at create/submit time.
 */
export function assertDistrictInState(code: number, stateShort: string): DistrictInfo {
  const district = getDistrict(code);
  if (district.stateShort !== stateShort) {
    throw new ApiError(
      400,
      "DISTRICT_STATE_MISMATCH",
      `District ${district.name} (${code}) belongs to ${district.stateName} (${district.stateShort}), not ${stateShort}.`,
    );
  }
  return district;
}

/** Normalize a district/state name for comparison: trim, lowercase, collapse spaces. */
function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Scope helper: resolve free-text state to its shortform for filtering.
 * Returns null when absent/unparseable — callers then search globally and
 * let 0/ambiguous hits produce explicit errors.
 */
function scopeStateShort(stateText?: string): string | null {
  if (!stateText || !stateText.trim()) return null;
  try {
    return getStateCode(stateText);
  } catch {
    return null;
  }
}

/**
 * Resolve a district NAME to its LGD entry (exact, case-insensitive).
 * District names are unique within a state, so sending `state` alongside
 * pins the code deterministically. Without a parseable state the search is
 * global: zero hits → INVALID_DISTRICT, cross-state repeats (only 3 exist:
 * Bilaspur HP/CG, Hamirpur HP/UP, Pratapgarh RJ/UP) → DISTRICT_AMBIGUOUS
 * with candidates.
 */
export function findDistrictByName(name: string, stateText?: string): DistrictInfo {
  const q = normalizeName(name);
  if (!q) {
    throw new ApiError(400, "INVALID_DISTRICT", "District name is empty.");
  }
  const scope = scopeStateShort(stateText);
  const pool = scope
    ? Object.values(DISTRICTS).filter((d) => d.stateShort === scope)
    : Object.values(DISTRICTS);
  const hits = pool.filter((d) => normalizeName(d.name) === q);
  if (hits.length === 1) return hits[0]!;
  if (hits.length === 0) {
    throw new ApiError(
      400,
      "INVALID_DISTRICT",
      scope
        ? `Unknown district "${name.trim()}" in state "${stateText!.trim()}".`
        : `Unknown district: "${name.trim()}". Send state alongside to disambiguate.`,
    );
  }
  throw new ApiError(
    400,
    "DISTRICT_AMBIGUOUS",
    `"${name.trim()}" matches multiple states: ${hits.map((h) => `${h.name} (${h.stateName})`).join(", ")}. Send state to pick one.`,
  );
}

/**
 * Autocomplete pool for the public lookup: optional state scope + optional
 * substring filter, sorted by LGD code. Pure in-memory over 784 entries.
 */
export function searchDistricts(query?: string, stateText?: string): DistrictInfo[] {
  const scope = scopeStateShort(stateText);
  let pool = scope
    ? Object.values(DISTRICTS).filter((d) => d.stateShort === scope)
    : Object.values(DISTRICTS);
  const q = query ? normalizeName(query) : "";
  if (q) pool = pool.filter((d) => normalizeName(d.name).includes(q));
  return [...pool].sort((a, b) => a.code - b.code);
}
