import { describe, expect, it } from "vitest";
import { ANIMALS } from "@uns/contracts";
import { ADJECTIVES, randomAlias } from "./alias-generator.js";

const ALIAS_PATTERN = /^[A-ZÁÉÍÓÚÑÜ][\p{L}]*\s[A-ZÁÉÍÓÚÑÜ][\p{L}]*$/u;

describe("randomAlias", () => {
  it("produces a 'Noun Adjective' string", () => {
    const alias = randomAlias();
    expect(alias).toMatch(ALIAS_PATTERN);
  });

  it("is deterministic for a fixed rng", () => {
    const a = randomAlias(() => 0);
    const b = randomAlias(() => 0);
    expect(a).toBe(b);
  });

  it("produces many distinct aliases across the pool (spot check)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(randomAlias());
    // 50+ nouns x 40+ adjectives gives a large pool; 200 draws should yield plenty of variety.
    expect(seen.size).toBeGreaterThan(50);
  });

  it("uses every catalog animal with the adjective form that agrees with its gender", () => {
    for (const animal of ANIMALS) {
      for (const adjective of ADJECTIVES) {
        // rng that lands exactly on this animal, then this adjective
        const values = [(ANIMALS.indexOf(animal) + 0.5) / ANIMALS.length, (ADJECTIVES.indexOf(adjective) + 0.5) / ADJECTIVES.length];
        let call = 0;
        const alias = randomAlias(() => values[call++]!);
        expect(alias).toBe(`${animal.noun} ${animal.gender === "M" ? adjective.masc : adjective.fem}`);
      }
    }
  });

  it("never yields a noun outside the animal catalog", () => {
    const nouns = new Set(ANIMALS.map((a) => a.noun));
    for (let i = 0; i < 300; i++) expect(nouns.has(randomAlias().split(" ")[0]!)).toBe(true);
  });

  it("never contains offensive or identity-revealing substrings", () => {
    const banned = ["puto", "pendejo", "boludo", "@", "http"];
    for (let i = 0; i < 100; i++) {
      const alias = randomAlias().toLowerCase();
      for (const word of banned) expect(alias).not.toContain(word);
    }
  });
});
