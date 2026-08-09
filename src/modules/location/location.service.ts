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
  /**
   * true when the device GPS is within VERIFY_TOLERANCE_METERS of the address
   * OR the GPS point reverse-geocodes to the same city+state as the address
   * (locality match — handles coarse OSM pins that land kilometres away).
   */
  verified: boolean;
  source: string;
  /** Device GPS as sent by the client, if any (rounded to 6 decimals). */
  gps: { latitude: number; longitude: number } | null;
  /** Great-circle distance between GPS and geocoded coords, if GPS sent. */
  distanceMeters: number | null;
  /** How verification passed: "gps" (≤500 m) | "locality" (same city+state) | null. */
  matchBasis: "gps" | "locality" | null;
}

export const VERIFY_TOLERANCE_METERS = 500;

/** Rounds coordinates to ~0.1 m precision (kills float noise like 25.343042800000003). */
export function roundCoord(v: number, decimals = 6): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

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
    const geo = await getGeocoder().geocode(address);
    return { ...geo, latitude: roundCoord(geo.latitude), longitude: roundCoord(geo.longitude) };
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
 * True when two address strings share city + state. Works on OSM/Nominatim
 * display names, e.g. "Naini, Karchhana, Prayagraj, Uttar Pradesh, 211108, India"
 * and "Chak Gulam, Naini, Prayagraj, Uttar Pradesh, 211008, India" — the last
 * address-ish tokens before pincode/country are the city and the state.
 */
export function sameLocality(a: string, b: string): boolean {
  const tokens = (s: string) =>
    s
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t && !/^\d{6}$/.test(t) && !["india", "india (भारत)"].includes(t));

  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length < 2 || tb.length < 2) return false;

  const state = (t: string[]) => t[t.length - 1];
  const city = (t: string[]) => t[t.length - 2];
  return state(ta) === state(tb) && city(ta) === city(tb);
}

/**
 * Hybrid location flow:
 *  - the typed address is ALWAYS geocoded server-side (users never type coords);
 *  - if the client also sends device GPS, both are cross-checked and the
 *    distance decides the verified flag — with a locality-level fallback for
 *    coarse geocoder pins.
 */
export async function verifyLocation(input: LocationVerifyInput): Promise<LocationVerifyResult> {
  const result = await geocodeAddress(input.address);

  let gps: { latitude: number; longitude: number } | null = null;
  let distance: number | null = null;
  let matchBasis: "gps" | "locality" | null = null;
  let verified = false;
  if (input.latitude !== undefined && input.longitude !== undefined) {
    gps = { latitude: roundCoord(input.latitude), longitude: roundCoord(input.longitude) };
    distance = distanceMeters(gps.latitude, gps.longitude, result.latitude, result.longitude);
    if (distance <= VERIFY_TOLERANCE_METERS) {
      verified = true;
      matchBasis = "gps";
    } else {
      const near = await getGeocoder().reverseGeocode(gps.latitude, gps.longitude);
      if (near && sameLocality(near, result.formattedAddress)) {
        verified = true;
        matchBasis = "locality";
      }
    }
  }

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    formattedAddress: result.formattedAddress,
    verified,
    source: result.source,
    gps,
    distanceMeters: distance === null ? null : Math.round(distance),
    matchBasis,
  };
}
