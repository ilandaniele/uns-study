import { describe, expect, it } from "vitest";
import {
  GARDEN_SPECIES,
  gardenPlantSchema,
  gardenRedeemSchema,
} from "./garden.js";

describe("native garden catalog and requests", () => {
  it("has unique species with official botanical sources and viable game economics", () => {
    expect(new Set(GARDEN_SPECIES.map((s) => s.id)).size).toBe(
      GARDEN_SPECIES.length,
    );
    for (const s of GARDEN_SPECIES) {
      expect(new URL(s.source).hostname).toMatch(/(gob\.ar|conicet\.gov\.ar)$/);
      expect(s.scientificName.split(" ").length).toBeGreaterThanOrEqual(2);
      expect(s.reward).toBeGreaterThan(s.cost);
      expect(s.growthMinutes).toBeGreaterThanOrEqual(120);
    }
  });
  it("bounds the garden and rejects stale or fabricated redemption identifiers", () => {
    expect(
      gardenPlantSchema.safeParse({ plot: 24, speciesId: "pehuen" }).success,
    ).toBe(true);
    expect(
      gardenPlantSchema.safeParse({ plot: 25, speciesId: "pehuen" }).success,
    ).toBe(false);
    expect(
      gardenPlantSchema.safeParse({ plot: 0, speciesId: "exotic" }).success,
    ).toBe(false);
    expect(
      gardenRedeemSchema.safeParse({ plot: 0, plantId: "fake" }).success,
    ).toBe(false);
  });
});
