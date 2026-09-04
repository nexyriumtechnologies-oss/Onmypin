import { DISTRICTS, type DistrictInfo } from "./districts.generated";
import { ApiError } from "@/middleware/errorHandler";

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
