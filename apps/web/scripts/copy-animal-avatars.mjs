// Copies ONLY the Twemoji SVGs the animal catalog needs into public/avatars/animals/<id>.svg.
// Twemoji graphics (c) Twitter, Inc. and other contributors, CC-BY 4.0 — see /privacidad.
// Usage: node apps/web/scripts/copy-animal-avatars.mjs
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANIMALS } from "../../../packages/contracts/src/animals.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const svgDir = path.join(path.dirname(require.resolve("@twemoji/svg/package.json")), "");
const outDir = path.join(here, "..", "public", "avatars", "animals");
mkdirSync(outDir, { recursive: true });

for (const animal of ANIMALS) {
  const src = path.join(svgDir, `${animal.twemoji}.svg`);
  if (!existsSync(src)) throw new Error(`Missing Twemoji ${animal.twemoji} for ${animal.id}`);
  copyFileSync(src, path.join(outDir, `${animal.id}.svg`));
}
console.log(`Copied ${ANIMALS.length} animal avatars to ${outDir}`);
