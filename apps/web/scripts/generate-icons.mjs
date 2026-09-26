// One-off generator for PWA icon PNGs from `public/icons/logo.svg`.
// Run with: node scripts/generate-icons.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(dir, "..", "public", "icons");
const svg = readFileSync(path.join(iconsDir, "logo.svg"));

async function main() {
  await sharp(svg).resize(192, 192).png().toFile(path.join(iconsDir, "icon-192.png"));
  await sharp(svg).resize(512, 512).png().toFile(path.join(iconsDir, "icon-512.png"));

  // Maskable icon: keep the artwork inside the ~80% "safe zone" adaptive-icon platforms use,
  // with solid background padding so it isn't cropped on Android.
  const inner = await sharp(svg).resize(410, 410).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: "#4f46e5" },
  })
    .composite([{ input: inner, left: 51, top: 51 }])
    .png()
    .toFile(path.join(iconsDir, "icon-maskable-512.png"));

  console.log("Generated icon-192.png, icon-512.png, icon-maskable-512.png");
}

main();
