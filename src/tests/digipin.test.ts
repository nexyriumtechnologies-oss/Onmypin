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
  it("produces the correct [STATE][DISTRICT-3][4-DIGIT] format", async () => {
    const pin = await generateDigiPin("West Bengal", 315, {
      persist: makePersistStore(new Set()),
    });
    expect(pin).toMatch(DIGIPIN_FORMAT);
    expect(pin).toMatch(/^WB315\d{4}$/);
  });

  it("handles lowercase state names and aliases", async () => {
    const pin = await generateDigiPin("  kerala  ", 555, {
      persist: makePersistStore(new Set()),
    });
    expect(pin).toMatch(/^KL555\d{4}$/);
  });

  it("generates 1000 DigiPins with zero collisions and correct format", async () => {
    const store = new Set<string>();
    const persist = makePersistStore(store);
    const states: Array<[string, number]> = [
      ["West Bengal", 315],
      ["Maharashtra", 482],
      ["Kerala", 555],
      ["Delhi", 79],
      ["Tamil Nadu", 568],
    ];

    for (let i = 0; i < 1000; i++) {
      const [state, code] = states[i % states.length]!;
      const pin = await generateDigiPin(state, code, { persist });
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
    const pin = await generateDigiPin("Maharashtra", 482, { persist, maxRetries: 10 });
    expect(pin).toMatch(/^MH482\d{4}$/);
    expect(persistCalls).toBe(4);
  });

  it("fails cleanly after exhausting retries on persistent collisions", async () => {
    const alwaysCollides = async () => {
      throw Object.assign(new Error("collision"), { code: "P2002" });
    };
    await expect(
      generateDigiPin("Delhi", 79, { persist: alwaysCollides, maxRetries: 3 }),
    ).rejects.toMatchObject({ code: "DIGIPIN_GENERATION_FAILED" });
  });

  it("rejects unknown states", async () => {
    const persist = async () => undefined;
    await expect(generateDigiPin("Narnia", 315, { persist })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
});
