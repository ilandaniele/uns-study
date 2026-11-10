import { describe, expect, it } from "vitest";
import { GARDEN_BIOMES, gardenBiomeSchema } from "./garden-biomes";
import {
  GARDEN_SPECIES,
  gardenPlantSchema,
  gardenRedeemSchema,
} from "./garden.js";

describe("native garden catalog and requests", () => {
  it("offers four progressive cosmetic biomes and rejects forged unlock claims", () => {
    expect(GARDEN_BIOMES.map(item=>item.requiredPlaces)).toEqual([0,5,15,30]);
    for(const biome of GARDEN_BIOMES) expect(gardenBiomeSchema.safeParse({biome:biome.id}).success).toBe(true);
    expect(gardenBiomeSchema.safeParse({biome:"desert"}).success).toBe(false);
    expect(gardenBiomeSchema.safeParse({biome:"andino",places:1000}).success).toBe(false);
    expect(GARDEN_SPECIES).toHaveLength(72);
    expect(GARDEN_SPECIES.slice(0,60).every(item=>(item.requiredPlaces??0)===0)).toBe(true);
  });
  it("has unique species with official botanical sources and viable game economics", () => {
    expect(new Set(GARDEN_SPECIES.map((s) => s.id)).size).toBe(
      GARDEN_SPECIES.length,
    );
    for (const s of GARDEN_SPECIES) {
      expect(gardenPlantSchema.safeParse({ plot: 0, speciesId: s.id }).success).toBe(true);
      expect(new URL(s.source).hostname).toMatch(/(gob\.ar|conicet\.gov\.ar|gov\.br)$/);
      expect(s.scientificName.split(" ").length).toBeGreaterThanOrEqual(2);
      expect(s.reward).toBeGreaterThan(s.cost);
      expect(s.growthMinutes).toBeGreaterThanOrEqual(120);
    }
  });
  it("includes trees, palms, shrubs, flowers, grasses and cacti without duplicate species", () => {
    expect(GARDEN_SPECIES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(GARDEN_SPECIES.map(s => s.scientificName)).size).toBe(GARDEN_SPECIES.length);
    expect(new Set(GARDEN_SPECIES.map(s => s.kind ?? "tree"))).toEqual(new Set(["tree", "palm", "shrub", "flower", "grass", "cactus", "aquatic"]));
  });
  it("bounds the garden and rejects stale or fabricated redemption identifiers", () => {
    expect(
      gardenPlantSchema.safeParse({ plot: 24, speciesId: "pehuen" }).success,
    ).toBe(true);
    expect(
      gardenPlantSchema.safeParse({ plot: 50, speciesId: "pehuen" }).success,
    ).toBe(false);
    expect(
      gardenPlantSchema.safeParse({ plot: 0, speciesId: "exotic" }).success,
    ).toBe(false);
    expect(
      gardenRedeemSchema.safeParse({ plot: 0, plantId: "fake" }).success,
    ).toBe(false);
  });
});
