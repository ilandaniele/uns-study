import { readFileSync, writeFileSync, readdirSync, realpathSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const input = process.argv[process.argv.indexOf("--input") + 1];
if (!process.argv.includes("--input") || !input) throw new Error("Usage: node scripts/legal/generate-notices.mjs --input <pnpm-license-report.json>");
const bytes = readFileSync(input);
// Windows PowerShell's redirection writes UTF-16LE; PowerShell 7 commonly writes UTF-8.
const report = JSON.parse((bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString("utf16le") : bytes.toString("utf8")).replace(/^\uFEFF/, ""));
const modules = realpathSync(path.join(root, "node_modules"));
const entries = Object.values(report).flat();
const twemoji = path.join(root, "apps/web/node_modules/@twemoji/svg");
const twemojiPackage = JSON.parse(readFileSync(path.join(twemoji, "package.json"), "utf8"));
entries.push({ name: twemojiPackage.name, versions: [twemojiPackage.version], license: "CC-BY-4.0 (graphics)", homepage: "https://github.com/jdecked/twemoji", paths: [twemoji] });

function licenseFiles(directory, prefix = "", depth = 0) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isFile() && /^(licen[cs]e|copying|copyright|notice)([._-]|$)/i.test(entry.name)) return [relative];
    if (entry.isDirectory() && depth < 2 && /^(licen[cs]es?|legal)$/i.test(entry.name)) return licenseFiles(path.join(directory, entry.name), relative, depth + 1);
    return [];
  }).sort();
}

const inventory = [];
const sections = [];
const seen = new Set();
for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
  const key = `${entry.name}@${entry.versions.join(",")}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const directory = realpathSync(entry.paths[0]);
  if (!directory.startsWith(modules + path.sep)) throw new Error(`Package outside installed node_modules: ${entry.name}`);
  const files = licenseFiles(directory);
  const homepage = typeof entry.homepage === "string" && /^https?:\/\//.test(entry.homepage) ? entry.homepage : null;
  inventory.push({ name: entry.name, versions: entry.versions, license: entry.license, homepage, noticeFiles: files, reviewRequired: files.length === 0 });
  sections.push(`\n${"=".repeat(72)}\n${key}\nDeclared license: ${entry.license}\n${homepage ?? ""}\n${files.length ? "" : "No standalone license/notice file found; review upstream distribution before redistribution.\n"}`);
  for (const file of files) sections.push(`\n--- ${file} ---\n${readFileSync(path.join(directory, file), "utf8")}\n`);
}
for (const file of ["Archivo-OFL.txt", "GeistMono-OFL.txt"]) {
  sections.push(`\n${"=".repeat(72)}\nSelf-hosted font — ${file}\n${readFileSync(path.join(root, "apps/web/src/fonts", file), "utf8")}\n`);
}
const publicDir = path.join(root, "apps/web/public/legal");
mkdirSync(publicDir, { recursive: true });
mkdirSync(path.join(root, "docs/legal"), { recursive: true });
const header = "Sala de Estudio — Third-party notices\n\nGenerated from the installed pnpm production dependency report plus vendored Twemoji graphics and fonts.\nThis is a Windows installation snapshot, not a declaration that every optional package ships to every platform.\nOriginal third-party terms prevail. Our proprietary notice does not relicense these materials.\nPackages without a separate notice file are listed for further review. No third-party source or binary is claimed as our own.\n\nTwemoji graphics: Copyright Twitter, Inc. and other contributors; CC BY 4.0.\nhttps://github.com/jdecked/twemoji — https://creativecommons.org/licenses/by/4.0/\nAnimal and reaction SVG files are copied/renamed for the app.\n";
writeFileSync(path.join(publicDir, "third-party-notices.txt"), header + sections.join(""), "utf8");
writeFileSync(path.join(root, "docs/legal/dependencies.json"), JSON.stringify({ format: 1, scope: "Installed production dependencies on Windows plus vendored graphics; font notices are included separately", packages: inventory }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ packages: inventory.length, reviewRequired: inventory.filter(x => x.reviewRequired).map(x => x.name), noticeBytes: Buffer.byteLength(header + sections.join("")) }));
