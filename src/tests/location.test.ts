import { describe, expect, it, beforeEach } from "vitest";
import {
  distanceMeters,
  verifyLocation,
  VERIFY_TOLERANCE_METERS,
} from "@/modules/location/location.service";

// Mock provider returns fixed New Delhi coords (28.6139, 77.2090) — no network.
const MOCK_LAT = 28.6139;
const MOCK_LNG = 77.209;

beforeEach(() => {
  process.env.LOCATION_PROVIDER = "mock";
});

describe("distanceMeters (haversine)", () => {
  it("returns ~0 for the same point", () => {
    expect(distanceMeters(28.6139, 77.209, 28.6139, 77.209)).toBeLessThan(1);
  });

  it("returns ~110km for 1 degree of latitude", () => {
    const d = distanceMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});

describe("verifyLocation (hybrid)", () => {
  it("geocodes the address with no GPS → unverified, no distance", async () => {
    const r = await verifyLocation({ address: "Connaught Place, New Delhi" });
    expect(r.latitude).toBe(MOCK_LAT);
    expect(r.longitude).toBe(MOCK_LNG);
    expect(r.source).toBe("mock");
    expect(r.verified).toBe(false);
    expect(r.gps).toBeNull();
    expect(r.distanceMeters).toBeNull();
  });

  it("GPS within tolerance → verified true", async () => {
    const r = await verifyLocation({
      address: "Connaught Place, New Delhi",
      latitude: MOCK_LAT + 0.002, // ~220m away
      longitude: MOCK_LNG,
    });
    expect(r.verified).toBe(true);
    expect(r.gps).toEqual({ latitude: MOCK_LAT + 0.002, longitude: MOCK_LNG });
    expect(r.distanceMeters).toBeLessThanOrEqual(VERIFY_TOLERANCE_METERS);
  });

  it("GPS far away → verified false with distance", async () => {
    const r = await verifyLocation({
      address: "Connaught Place, New Delhi",
      latitude: 19.076, // Mumbai
      longitude: 72.8777,
    });
    expect(r.verified).toBe(false);
    expect(r.distanceMeters).toBeGreaterThan(1000000);
  });

  it("GPS exactly at the geocoded point → verified true, ~0m", async () => {
    const r = await verifyLocation({
      address: "Connaught Place, New Delhi",
      latitude: MOCK_LAT,
      longitude: MOCK_LNG,
    });
    expect(r.verified).toBe(true);
    expect(r.distanceMeters).toBeLessThanOrEqual(1);
  });
});
