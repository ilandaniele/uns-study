import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Rebuild from optimized, checked-in sources without local reference files.
const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url));
const output = fileURLToPath(new URL("../public/room/ceniza-v2.webp", import.meta.url));
const cell = 96;
const frames = [];
async function cycle(source, regions) {
  const images = await Promise.all(regions.map((region) => sharp(source).extract(region).png().toBuffer()));
  // Common crop and scale prevent the body from changing size with each step.
  let left = Infinity, top = Infinity, right = 0, bottom = 0;
  for (const image of images) {
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 30) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  for (const image of images) frames.push(await sharp(image)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(88, 84, { fit: "contain", background: "#00000000", position: "south" })
    .extend({ top: 6, bottom: 6, left: 4, right: 4, background: "#00000000" }).png().toBuffer());
}
const grid = (startRow) => Array.from({ length: 8 }, (_, i) => ({
  left: (i % 4) * 256, top: (startRow + Math.floor(i / 4)) * 256, width: 256, height: 256,
}));
await cycle(asset("ceniza-walk-source.webp"), grid(0)); // 0..7: right, mirrored for left
await cycle(asset("ceniza-up-source.webp"), Array.from({ length: 7 }, (_, i) => ({
  left: i * 256, top: 188, width: 256, height: 220,
}))); // 8..14: up
await cycle(asset("ceniza-walk-source.webp"), grid(2)); // 15..22: down
for (let i = 0; i < 4; i++) frames.push(await sharp(asset("ceniza-rest-source.webp"))
  .extract({ left: i * cell, top: 0, width: cell, height: cell }).png().toBuffer());
await mkdir(fileURLToPath(new URL("../public/room/", import.meta.url)), { recursive: true });
await sharp({ create: { width: cell * frames.length, height: cell, channels: 4, background: "#00000000" } })
  .composite(frames.map((input, i) => ({ input, left: i * cell, top: 0 })))
  .webp({ quality: 88, alphaQuality: 95, effort: 6 }).toFile(output);
const { size } = await stat(output);
if (size >= 500_000) throw new Error(`Sprite exceeds budget: ${size} bytes`);
console.log(`Ceniza: ${size} bytes, ${cell * frames.length} × ${cell}, ${frames.length} poses`);
