import { ApiError } from "@/middleware/errorHandler";
import { getGeocoder, GeocodeError } from "./location.provider";

export interface LocationVerifyInput {
  /** Device GPS from the client — optional; when absent only geocoding happens. */
  latitude?: number;
  longitude?: number;
  address: string;
}

export interface LocationVerifyResult {
  /** Geocoded coordinates for the typed address. */
  latitude: number;
  longitude: number;
  formattedAddress: string;
  /** true only when device GPS is within VERIFY_TOLERANCE_METERS of the address. */
  verified: boolean;
  source: string;
  /** Device GPS as sent by the client, if any. */
  gps: { latitude: number; longitude: number } | null;
  /** Great-circle distance between GPS and geocoded coords, if GPS sent. */
  distanceMeters: number | null;
}

export const VERIFY_TOLERANCE_METERS = 500;

/** Great-circle distance in meters (haversine). */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Geocodes a full address into coordinates (used by property submit). */
export async function geocodeAddress(address: string) {
  try {
    return await getGeocoder().geocode(address);
  } catch (err) {
    if (err instanceof GeocodeError) {
      throw new ApiError(
        502,
        "GEOCODE_FAILED",
        "Could not resolve the address to a location — refine it and retry",
      );
    }
    throw err;
  }
}

/**
 * Hybrid location flow:
 *  - the typed address is ALWAYS geocoded server-side (users never type coords);
 *  - if the client also sends device GPS, both are cross-checked and the
 *    distance decides the verified flag.
 */
export async function verifyLocation(input: LocationVerifyInput): Promise<LocationVerifyResult> {
  const result = await geocodeAddress(input.address);

  let gps: { latitude: number; longitude: number } | null = null;
  let distance: number | null = null;
  if (input.latitude !== undefined && input.longitude !== undefined) {
    gps = { latitude: input.latitude, longitude: input.longitude };
    distance = distanceMeters(input.latitude, input.longitude, result.latitude, result.longitude);
  }

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    formattedAddress: result.formattedAddress,
    verified: distance !== null && distance <= VERIFY_TOLERANCE_METERS,
    source: result.source,
    gps,
    distanceMeters: distance === null ? null : Math.round(distance),
  };
}
