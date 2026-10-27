import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Usage: node scripts/build-native-tree-atlases.mjs adults.png young.png seedlings.png
// This only crops transparent gutters, resizes and packs GPT-generated cutouts; it never
// paints foliage, removes backgrounds or changes the generated illustrations.
const expansion = process.argv[2] === "--expansion";
const wetland = process.argv[2] === "--wetland";
const sources = process.argv.slice(expansion || wetland ? 3 : 2);
if (sources.length !== (expansion ? 5 : 3)) throw new Error(expansion ? "Expected trees adult/young, plants adult/young, seedlings PNG paths." : "Expected adult, young and seedling source PNG paths.");
const destination = fileURLToPath(new URL("../public/garden/", import.meta.url));
const CELL_WIDTH = 256;
const CELL_HEIGHT = 288;
const ROOT_Y = 270;

function cuts(occupancy, count) {
  const result = [0];
  const pitch = occupancy.length / count;
  for (let index = 1; index < count; index++) {
    const expected = pitch * index;
    const start = Math.floor(expected - pitch * .32);
    const end = Math.ceil(expected + pitch * .32);
    const candidates = [];
    for (let position = start; position < end;) {
      if (occupancy[position]) { position++; continue; }
      const from = position;
      while (position < end && !occupancy[position]) position++;
      if (position - from < 2) continue;
      const middle = Math.floor((from + position) / 2);
      candidates.push({ middle, score: Math.abs(expected - middle) + 25 / (position - from) });
    }
    candidates.sort((a, b) => a.score - b.score);
    if (!candidates.length) throw new Error(`No transparent separator near sprite boundary ${index}/${count}.`);
    result.push(candidates[0].middle);
  }
  return [...result, occupancy.length];
}

async function pack(source, columns, rows, filename, dimensions, quality = 74) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rowOccupancy = Array(info.height).fill(0);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 16) rowOccupancy[y]++;
  }
  const rowCuts = cuts(rowOccupancy, rows);
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    const columnOccupancy = Array(info.width).fill(0);
    for (let y = rowCuts[row]; y < rowCuts[row + 1]; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 16) columnOccupancy[x]++;
    }
    const columnCuts = cuts(columnOccupancy, columns);
    for (let column = 0; column < columns; column++) {
      let left = info.width, right = 0, top = info.height, bottom = 0, solidBottom = 0;
      for (let y = rowCuts[row]; y < rowCuts[row + 1]; y++) for (let x = columnCuts[column]; x < columnCuts[column + 1]; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha > 16) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
        if (alpha > 180) solidBottom = Math.max(solidBottom, y);
      }
      if (right <= left || bottom <= top) throw new Error(`Empty sprite at ${row}, ${column}.`);
      const bounds = { left: Math.max(columnCuts[column], left - 2), top: Math.max(rowCuts[row], top - 2) };
      bounds.width = Math.min(columnCuts[column + 1], right + 3) - bounds.left;
      bounds.height = Math.min(rowCuts[row + 1], bottom + 3) - bounds.top;
      let rootX = 0, rootPixels = 0;
      for (let y = Math.max(top, solidBottom - Math.max(6, Math.round(bounds.height * .07))); y <= solidBottom; y++) {
        for (let x = left; x <= right; x++) if (data[(y * info.width + x) * 4 + 3] > 180) { rootX += x; rootPixels++; }
      }
      const anchorX = (rootPixels ? rootX / rootPixels : (left + right) / 2) - bounds.left;
      const { width: maxWidth, height: maxHeight } = dimensions[row * columns + column];
      const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
      const width = Math.max(1, Math.round(bounds.width * scale));
      const height = Math.max(1, Math.round(bounds.height * scale));
      const x = Math.max(4, Math.min(CELL_WIDTH - width - 4, Math.round(CELL_WIDTH / 2 - anchorX * scale)));
      const y = ROOT_Y - Math.round((solidBottom - bounds.top) * scale);
      if (y < 4 || y + height > CELL_HEIGHT - 2) throw new Error(`Sprite base out of bounds at ${row}, ${column}.`);
      const tile = await sharp(data, { raw: info }).extract(bounds).resize(width, height).png().toBuffer();
      tiles.push({ input: tile, left: column * CELL_WIDTH + x, top: row * CELL_HEIGHT + y });
    }
  }
  const output = `${destination}/${filename}`;
  await sharp({ create: { width: CELL_WIDTH * columns, height: CELL_HEIGHT * rows, channels: 4, background: "#00000000" } })
    .composite(tiles).webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(output);
  const bytes = (await stat(output)).size;
  console.log(`${filename}: ${bytes} bytes (${columns * CELL_WIDTH}x${rows * CELL_HEIGHT}, ${tiles.length} sprites)`);
  return bytes;
}

await mkdir(destination, { recursive: true });
if (wetland) {
  const adults = [
    { width: 160, height: 175 }, { width: 160, height: 186 }, { width: 150, height: 95 }, { width: 140, height: 115 },
    { width: 135, height: 165 }, { width: 140, height: 155 }, { width: 130, height: 186 }, { width: 125, height: 186 },
    { width: 100, height: 186 }, { width: 145, height: 115 }, { width: 145, height: 82 }, { width: 150, height: 95 },
  ];
  const young = adults.map(d => ({ width: Math.round(d.width * .68), height: Math.round(d.height * .68) }));
  const bytes = await pack(sources[0], 4, 3, "pastizal-humedal-adultos-gpt-v1.webp", adults, 62)
    + await pack(sources[1], 4, 3, "pastizal-humedal-jovenes-gpt-v1.webp", young, 58)
    + await pack(sources[2], 2, 1, "brotes-acuaticos-gpt-v1.webp", [{ width: 40, height: 30 }, { width: 76, height: 47 }], 68);
  console.log(`Wetland: ${bytes} bytes`);
  if (bytes >= 500_000) throw new Error("Wetland atlas budget exceeded: keep the three new assets under 500 KB.");
  process.exit(0);
}
if (expansion) {
  const trees = Array(12).fill({ width: 160, height: 186 });
  const young = Array(12).fill({ width: 110, height: 130 });
  const plants = [
    ...Array(6).fill({ width: 160, height: 186 }),
    { width: 140, height: 98 }, { width: 135, height: 150 },
    { width: 160, height: 180 }, { width: 110, height: 186 },
    { width: 140, height: 165 }, { width: 100, height: 100 },
  ];
  const plantYoung = plants.map(d => ({ width: Math.round(d.width * .65), height: Math.round(d.height * .65) }));
  const bytes = await pack(sources[0], 4, 3, "arboles-extra-adultos-gpt-v1.webp", trees, 58)
    + await pack(sources[1], 4, 3, "arboles-extra-jovenes-gpt-v1.webp", young, 54)
    + await pack(sources[2], 4, 3, "plantas-nativas-adultos-gpt-v1.webp", plants, 58)
    + await pack(sources[3], 4, 3, "plantas-nativas-jovenes-gpt-v1.webp", plantYoung, 54)
    + await pack(sources[4], 4, 2, "brotes-nativos-gpt-v1.webp", Array.from({ length: 8 }, (_, i) => i % 2 ? { width: 72, height: 78 } : { width: 40, height: 34 }), 68);
  console.log(`Expansion: ${bytes} bytes`);
  if (bytes >= 500_000) throw new Error("Expansion atlas budget exceeded: keep the five new assets under 500 KB.");
  process.exit(0);
}
const bytes = await pack(sources[0], 4, 3, "arboles-adultos-gpt-v1.webp", Array(12).fill({ width: 216, height: 248 }))
  + await pack(sources[1], 4, 3, "arboles-jovenes-gpt-v1.webp", Array(12).fill({ width: 162, height: 190 }))
  + await pack(sources[2], 2, 2, "brotes-gpt-v1.webp", [
    { width: 44, height: 32 }, { width: 86, height: 102 },
    { width: 44, height: 38 }, { width: 86, height: 102 },
  ]);
console.log(`Total: ${bytes} bytes`);
if (bytes >= 500_000) throw new Error("Tree atlas budget exceeded: keep the three assets under 500 KB.");
