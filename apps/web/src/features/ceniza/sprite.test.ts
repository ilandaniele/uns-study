import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SPRITE_COLUMNS, SPRITE_FRAMES, SPRITE_ROWS, WALK_FRAMES } from "./behavior";

const source = readFileSync(new URL("../../../public/room/ceniza-v6.webp", import.meta.url));
const cell = 96;
const pixels = (frame: number) => sharp(source)
  .extract({ left: frame % SPRITE_COLUMNS * cell, top: Math.floor(frame / SPRITE_COLUMNS) * cell, width: cell, height: cell })
  .ensureAlpha().raw().toBuffer();

describe("Ceniza atlas registration", () => {
  it("keeps the walking torso centred within one map pixel across the whole gait", async () => {
    const centres = await Promise.all(Array.from({ length: WALK_FRAMES }, async (_, frame) => {
      const data = await pixels(frame);
      let weight = 0, sum = 0;
      // The chest band excludes the independently moving tail and paws.
      for (let y = 24; y < 48; y++) for (let x = 0; x < cell; x++) {
        const alpha = data[(y * cell + x) * 4 + 3]!;
        if (alpha > 200) { weight += alpha; sum += x * alpha; }
      }
      expect(weight).toBeGreaterThan(0);
      return sum / weight * 70 / cell;
    }));
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(1);
  });

  it("preserves the resting ground contact, transparency and download budget", async () => {
    const metadata = await sharp(source).metadata();
    expect(metadata.width).toBe(SPRITE_COLUMNS * cell);
    expect(metadata.height).toBe(SPRITE_ROWS * cell);
    expect(metadata.hasAlpha).toBe(true);
    expect(source.length).toBeLessThan(500_000);
    for (let frame = WALK_FRAMES; frame < SPRITE_FRAMES; frame++) {
      const data = await pixels(frame);
      let bottom = 0;
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        if (data[(y * cell + x) * 4 + 3]! > 60) bottom = y;
      }
      expect(Math.abs(bottom - 89)).toBeLessThanOrEqual(1);
    }
  });
});
