import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Rebuild from optimized, checked-in sources without local reference files.
const asset = (name) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url));
const output = fileURLToPath(new URL("../public/room/ceniza-v6.webp", import.meta.url));
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
// Register the chest rather than the tail/paws: their movement must never shift
// the entire dog from side to side. Keep one scale and anchor for every phase.
for (const region of grid.slice(0, 8)) {
  const tile = await sharp(asset("ceniza-overhead-source.webp")).extract(region).png().toBuffer();
  const { data } = await sharp(tile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = 128, bottom = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (data[(y * 128 + x) * 4 + 3] > 60) {
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  let weight = 0, xSum = 0, ySum = 0;
  for (let y = Math.ceil(top + (bottom - top) * 0.22); y <= top + (bottom - top) * 0.52; y++) {
    for (let x = 0; x < 128; x++) {
      const alpha = data[(y * 128 + x) * 4 + 3];
      if (alpha > 200) { weight += alpha; xSum += x * alpha; ySum += y * alpha; }
    }
  }
  const dx = Math.round(64 - xSum / weight), dy = Math.round(54 - ySum / weight);
  const padded = await sharp(tile)
    .extend({ left: Math.max(0, dx), right: Math.max(0, -dx), top: Math.max(0, dy), bottom: Math.max(0, -dy), background: "#00000000" })
    .png().toBuffer();
  frames.push(await sharp(padded)
    .extract({ left: Math.max(0, -dx), top: Math.max(0, -dy), width: 128, height: 128 })
    .resize(cell, cell).png().toBuffer());
}
for (let i = 0; i < 4; i++) frames.push(await sharp(asset("ceniza-rest-source.webp"))
  .extract({ left: i * cell, top: 0, width: cell, height: cell }).png().toBuffer());
await cycle(asset("ceniza-settle-source.webp"), grid.slice(0, 8)); // 12..19: stand to side sleep
// Contact registration: generated lying poses have different transparent padding.
// Translate (never resize) them onto the same floor baseline as standing paws.
for (let i = 8; i < frames.length; i++) {
  const { data, info } = await sharp(frames[i]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 60) bottom = y;
  }
  const shift = 89 - bottom;
  if (shift > 0) frames[i] = await sharp(frames[i])
    .extend({ top: shift, bottom: 0, left: 0, right: 0, background: "#00000000" })
    .extract({ left: 0, top: 0, width: cell, height: cell }).png().toBuffer();
}
await mkdir(fileURLToPath(new URL("../public/room/", import.meta.url)), { recursive: true });
const columns = 8;
const rows = Math.ceil(frames.length / columns);
await sharp({ create: { width: cell * columns, height: cell * rows, channels: 4, background: "#00000000" } })
  .composite(frames.map((input, i) => ({ input, left: (i % columns) * cell, top: Math.floor(i / columns) * cell })))
  .webp({ quality: 88, alphaQuality: 95, effort: 6 }).toFile(output);
const { size } = await stat(output);
if (size >= 500_000) throw new Error(`Sprite exceeds budget: ${size} bytes`);
console.log(`Ceniza: ${size} bytes, ${cell * columns} x ${cell * rows}, ${frames.length} poses`);
