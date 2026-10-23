import sharp from "sharp";
import { readdir, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Run from any directory: pnpm --filter @sala/web exec node scripts/build-ceniza-sprite.mjs
const source = fileURLToPath(new URL("../../../ceniza/", import.meta.url));
const output = fileURLToPath(new URL("../public/room/ceniza.webp", import.meta.url));
const files = (await readdir(source)).filter((name) => name.endsWith(".png")).sort();
// Five walking poses, curled sleep, lying sleep, bark, seated rest.
const indices = [15, 16, 17, 18, 19, 21, 22, 23, 24];
if (files.length !== 25) throw new Error("Expected the 25 original Ceniza poses");
const cell = 96;
const frames = await Promise.all(indices.map(async (index, i) => ({
  input: await sharp(`${source}/${files[index]}`).trim().resize(88, 84, {
    fit: "contain", background: "#00000000",
  }).extend({ top: 6, bottom: 6, left: 4, right: 4, background: "#00000000" }).png().toBuffer(),
  left: i * cell, top: 0,
})));
await mkdir(fileURLToPath(new URL("../public/room/", import.meta.url)), { recursive: true });
await sharp({ create: { width: cell * frames.length, height: cell, channels: 4, background: "#00000000" } })
  .composite(frames).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(output);
const { size } = await stat(output);
if (size >= 500_000) throw new Error(`Sprite exceeds budget: ${size} bytes`);
console.log(`Ceniza: ${size} bytes, ${cell * frames.length} × ${cell}, ${frames.length} poses`);
