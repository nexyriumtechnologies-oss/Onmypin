import { describe, expect, it } from "vitest";
import { generateDigiPin, DIGIPIN_FORMAT } from "@/modules/digipin/digipin.service";

/**
 * Fake persistence layer that mimics the DB `@@unique([digipinNumber])`
 * constraint by throwing Prisma's P2002 error shape on collision.
 */
function makePersistStore(store: Set<string>) {
  return async (digipinNumber: string) => {
    if (store.has(digipinNumber)) {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
    store.add(digipinNumber);
  };
}

describe("DigiPin generation", () => {
  it("produces the correct [STATE][4-DIGIT][PINCODE-2] format", async () => {
    const pin = await generateDigiPin("West Bengal", "700001", {
      persist: makePersistStore(new Set()),
    });
    expect(pin).toMatch(DIGIPIN_FORMAT);
    expect(pin).toMatch(/^WB\d{4}01$/);
  });

  it("handles lowercase state names and aliases", async () => {
    const pin = await generateDigiPin("  kerala  ", "682001", {
      persist: makePersistStore(new Set()),
    });
    expect(pin).toMatch(/^KL\d{4}01$/);
  });

  it("generates 1000 DigiPins with zero collisions and correct format", async () => {
    const store = new Set<string>();
    const persist = makePersistStore(store);
    const states = ["West Bengal", "Maharashtra", "Kerala", "Delhi", "Tamil Nadu"];
    const pincodes = ["700001", "400001", "682001", "110001", "600001"];

    for (let i = 0; i < 1000; i++) {
      const pin = await generateDigiPin(states[i % states.length]!, pincodes[i % pincodes.length]!, {
        persist,
      });
      expect(pin).toMatch(DIGIPIN_FORMAT);
      expect(store.size).toBe(i + 1);
    }
    expect(store.size).toBe(1000);
  });

  it("retries when the unique constraint fires and eventually succeeds", async () => {
    let persistCalls = 0;
    const persist = async (_pin: string) => {
      persistCalls++;
      if (persistCalls <= 3) throw Object.assign(new Error("collision"), { code: "P2002" });
    };
    const pin = await generateDigiPin("Maharashtra", "400001", { persist, maxRetries: 10 });
    expect(pin).toMatch(/^MH\d{4}01$/);
    expect(persistCalls).toBe(4);
  });

  it("fails cleanly after exhausting retries on persistent collisions", async () => {
    const alwaysCollides = async () => {
      throw Object.assign(new Error("collision"), { code: "P2002" });
    };
    await expect(
      generateDigiPin("Delhi", "110001", { persist: alwaysCollides, maxRetries: 3 }),
    ).rejects.toMatchObject({ code: "DIGIPIN_GENERATION_FAILED" });
  });

  it("rejects unknown states", async () => {
    const persist = async () => undefined;
    await expect(generateDigiPin("Narnia", "000001", { persist })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
});
