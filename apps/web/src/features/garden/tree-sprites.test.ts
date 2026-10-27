import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GARDEN_SPECIES } from "@sala/contracts";
import { treeSprite } from "./tree-sprites";

describe("native garden artwork coverage", () => {
  it("has a distinct real sprite for every species at both later growth stages", () => {
    for (const stage of ["young", "mature"] as const) {
      const frames = GARDEN_SPECIES.map(species => {
        const sprite = treeSprite(species, stage);
        expect(existsSync(fileURLToPath(new URL(`../../../public/garden/${sprite.file}`, import.meta.url)))).toBe(true);
        expect(sprite.frame).toBeGreaterThanOrEqual(0);
        expect(sprite.frame).toBeLessThan(sprite.columns * sprite.rows);
        return `${sprite.file}:${sprite.frame}`;
      });
      expect(new Set(frames).size).toBe(GARDEN_SPECIES.length);
    }
  });
  it("uses different germination drawings for palms, cacti, grasses, flowers and trees", () => {
    const ids = ["espinillo", "pehuen", "yatay", "cardon", "cortadera", "salvia-azul"];
    for (const stage of ["seed", "sprout"] as const) {
      const frames = ids.map(id => treeSprite(GARDEN_SPECIES.find(s => s.id === id)!, stage));
      expect(new Set(frames.map(s => `${s.file}:${s.frame}`)).size).toBe(ids.length);
      for (const sprite of frames) expect(existsSync(fileURLToPath(new URL(`../../../public/garden/${sprite.file}`, import.meta.url)))).toBe(true);
    }
  });
});
