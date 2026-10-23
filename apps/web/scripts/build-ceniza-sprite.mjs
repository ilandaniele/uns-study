import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Rebuild from optimized, checked-in sources without local reference files.
const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url));
const output = fileURLToPath(new URL("../public/room/ceniza-v3.webp", import.meta.url));
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
const grid = Array.from({ length: 16 }, (_, i) => ({
  left: (i % 4) * 128, top: Math.floor(i / 4) * 128, width: 128, height: 128,
}));
await cycle(asset("ceniza-side-source.webp"), grid); // 0..15: right, mirrored for left
await cycle(asset("ceniza-up-source.webp"), grid); // 16..31: up
await cycle(asset("ceniza-down-source.webp"), grid); // 32..47: down
for (let i = 0; i < 4; i++) frames.push(await sharp(asset("ceniza-rest-source.webp"))
  .extract({ left: i * cell, top: 0, width: cell, height: cell }).png().toBuffer());
await mkdir(fileURLToPath(new URL("../public/room/", import.meta.url)), { recursive: true });
const columns = 8;
const rows = Math.ceil(frames.length / columns);
await sharp({ create: { width: cell * columns, height: cell * rows, channels: 4, background: "#00000000" } })
  .composite(frames.map((input, i) => ({ input, left: (i % columns) * cell, top: Math.floor(i / columns) * cell })))
  .webp({ quality: 88, alphaQuality: 95, effort: 6 }).toFile(output);
const { size } = await stat(output);
if (size >= 500_000) throw new Error(`Sprite exceeds budget: ${size} bytes`);
console.log(`Ceniza: ${size} bytes, ${cell * columns} x ${cell * rows}, ${frames.length} poses`);
