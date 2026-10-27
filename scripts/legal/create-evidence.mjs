import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSourceEvidencePath, isUncertainAsset, OWNER_DECLARATIONS } from "./source-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const target = option("--output");
if (!target || !path.isAbsolute(target)) throw new Error("Use --output with an absolute folder outside the repository.");
const output = path.resolve(target);
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
if (inside(root, output)) throw new Error("The dossier must stay outside the public repository.");
if (existsSync(output)) throw new Error("Use a new folder: existing evidence is never overwritten.");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("status", "--porcelain")) throw new Error("Commit the intended changes first; evidence requires a clean tree.");
const commit = git("rev-parse", "HEAD");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const selected = tracked.filter(isSourceEvidencePath);
for (const file of selected) {
  if (file.includes("\n") || file.includes("\r") || path.isAbsolute(file) || file.split("/").includes("..")) throw new Error("Unsupported source path.");
  const full = path.join(root, file);
  if (lstatSync(full).isSymbolicLink() || !inside(realpathSync(root), realpathSync(full))) throw new Error(`Unsafe source path: ${file}`);
}
mkdirSync(output, { recursive: true });
if (!inside(realpathSync(path.dirname(output)), realpathSync(output)) || inside(realpathSync(root), realpathSync(output))) throw new Error("Unsafe output folder.");
writeFileSync(path.join(output, "LEEME.txt"), "EXPORTACIÓN INCOMPLETA. No utilizar hasta que exista COMPLETADO.json y se hayan verificado las huellas. Esto no es una presentación ni un registro oficial.\n");
const manifest = selected.sort().map(file => {
  const bytes = readFileSync(path.join(root, file));
  return { file, bytes: bytes.length, sha256: sha(bytes) };
});
const listFile = path.join(output, "source-files.txt");
writeFileSync(listFile, selected.join("\n") + "\n");
const archive = path.join(output, `sala-de-estudio-${commit.slice(0, 12)}-fuentes.zip`);
// bsdtar (included in Windows) supports ZIP. No shell expansion and only selected tracked files.
execFileSync("tar", ["--format=zip", "-cf", archive, "-C", root, "-T", listFile], { stdio: "pipe" });
const archived = execFileSync("tar", ["-tf", archive], { encoding: "utf8" }).trim().split(/\r?\n/).sort();
if (JSON.stringify(archived) !== JSON.stringify([...selected].sort()) || archived.some(p => !isSourceEvidencePath(p))) throw new Error("Unexpected archive contents.");
const excluded = tracked.filter(isUncertainAsset);
writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ format: 2, commit, repository: "https://github.com/ilandaniele/uns-study", createdAt: new Date().toISOString(), holder: "Ilan Daniele", status: "Preparación; no presentado ni registrado", scope: "Tracked source bytes; not a notarized timestamp, author certification or complete official executable deposit", ownerDeclarations: OWNER_DECLARATIONS, files: manifest, excludedFromSubmission: excluded, expresslyExcludedByHolder: OWNER_DECLARATIONS.expresslyExcludedFromSubmission, excludedPendingRights: excluded.filter(file => !OWNER_DECLARATIONS.expresslyExcludedFromSubmission.includes(file)) }, null, 2) + "\n");
writeFileSync(path.join(output, "historia-tecnica.txt"), git("log", "--format=%H %aI %s") + "\n");
const documents = path.join(output, "documentos");
mkdirSync(path.join(documents, "docs/legal"), { recursive: true });
for (const file of tracked.filter(p => p.startsWith("docs/legal/") && /\.(?:md|json)$/.test(p))) copyFileSync(path.join(root, file), path.join(documents, file));
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) copyFileSync(path.join(root, file), path.join(documents, file));
const brand = path.join(output, "marca-en-evaluacion");
mkdirSync(brand);
for (const file of ["logo-mark.webp", "logo-mark-dark.webp", "icon-512.png"]) copyFileSync(path.join(root, "apps/web/public/icons", file), path.join(brand, file));
writeFileSync(path.join(brand, "LEEME.txt"), "Reproducciones del signo actualmente usado, sólo para revisión. No acreditan autoría, disponibilidad, solicitud ni registro de marca. Debe aprobarse la reproducción exacta y documentarse su origen antes de presentar.\n");

// An executable API module is optional and uses the existing build tool, with no environment file.
if (process.argv.includes("--api-executable")) {
  const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
  const buildRequire = createRequire(apiRequire.resolve("vite"));
  const { build } = buildRequire("esbuild");
  const executable = path.join(output, "ejecutable-api");
  mkdirSync(executable);
  await build({ absWorkingDir: root, entryPoints: ["apps/api/src/worker.ts"], outfile: path.join(executable, "worker.mjs"), bundle: true, format: "esm", platform: "node", target: "es2022", external: ["cloudflare:*"], loader: { ".sql": "text" }, legalComments: "linked", logLevel: "warning" });
  execFileSync(process.execPath, ["--check", path.join(executable, "worker.mjs")], { stdio: "pipe" });
  copyFileSync(path.join(root, "apps/web/public/legal/third-party-notices.txt"), path.join(executable, "third-party-notices.txt"));
  writeFileSync(path.join(executable, "LEEME.txt"), "Módulo JavaScript compilado del servidor de la versión indicada. Requiere el runtime Cloudflare Workers, Durable Objects y bindings configurados por separado. No contiene credenciales ni datos de producción. No equivale al depósito completo de la app web: confirmar con DNDA cómo acompañar cliente, runtime y recursos excluidos.\n");
}

if (process.argv.includes("--web-build")) {
  const buildRoot = path.join(root, "apps/web/.next");
  if (!existsSync(path.join(buildRoot, "BUILD_ID"))) throw new Error("Run pnpm --filter @sala/web build before exporting the web build.");
  const web = path.join(output, "ejecutable-web");
  const copyBuild = (source, target) => {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      const full = path.join(source, entry.name);
      if (!inside(realpathSync(buildRoot), realpathSync(full))) throw new Error("Build path outside the expected folder.");
      if (entry.isDirectory()) copyBuild(full, path.join(target, entry.name));
      else if (/\.(?:js|mjs|json|html|css|woff2?|wasm|rsc|txt)$/.test(entry.name) && !/\.(?:nft\.json|meta|map)$/.test(entry.name)) copyFileSync(full, path.join(target, entry.name));
    }
  };
  for (const directory of ["static", "server"]) copyBuild(path.join(buildRoot, directory), path.join(web, directory));
  copyFileSync(path.join(buildRoot, "BUILD_ID"), path.join(web, "BUILD_ID"));
  copyFileSync(path.join(root, "apps/web/public/legal/third-party-notices.txt"), path.join(web, "third-party-notices.txt"));
  writeFileSync(path.join(web, "LEEME.txt"), "JavaScript/CSS/fuentes del cliente y módulos de servidor generados por next build. Requieren el runtime Next.js 16 y las dependencias del lockfile; el despliegue Cloudflare utiliza además OpenNext. No es una copia de producción ni un despliegue autónomo. No se exportan cachés, entornos, trazas ni datos de usuarios. Los gráficos de origen pendiente se mantienen excluidos según el inventario. Confirmar con DNDA el formato del depósito antes de presentar.\n");
}

const webRequire = createRequire(path.join(root, "apps/web/package.json"));
const { chromium } = webRequire("@playwright/test");
const browser = await chromium.launch();
const escape = value => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function html(markdown) {
  // Escape before rendering a small Markdown subset; no raw HTML or executable content.
  const inline = value => escape(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = markdown.split(/\r?\n/);
  const parts = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith("|") && /^\|[\s:|\-]+$/.test(lines[index + 1] ?? "")) {
      const cells = row => row.replace(/^\||\|$/g, "").split("|").map(cell => inline(cell.trim()));
      parts.push(`<table><thead><tr>${cells(line).map(cell => `<th>${cell}</th>`).join("")}</tr></thead><tbody>`);
      index += 2;
      while (index < lines.length && lines[index].startsWith("|")) {
        parts.push(`<tr>${cells(lines[index]).map(cell => `<td>${cell}</td>`).join("")}</tr>`); index++;
      }
      index--; parts.push("</tbody></table>"); continue;
    }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) { parts.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
    if (line.trim()) parts.push(`<p>${inline(line)}</p>`);
  }
  return parts.join("\n");
}
try {
  for (const file of ["README.md", "DNDA.md", "INPI.md", "ASSETS.md", "DECLARACION_ORIGEN.md", "COLABORADORES.md"]) {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><title>${escape(file)}</title><style>@page{size:A4;margin:18mm}body{font:11pt/1.5 Arial,sans-serif;color:#17251e}h1{font-size:22pt;line-height:1.2;border-bottom:2px solid #126c78;padding-bottom:12px}h2{font-size:15pt;margin-top:24px;break-after:avoid}h3{font-size:12pt;break-after:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}code{font-size:9pt;background:#eef2ef}table{width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed}th,td{border:1px solid #b7c5bd;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf3ef}tr{break-inside:avoid}footer{font-size:8pt;color:#68766e}</style><body>${html(readFileSync(path.join(root, "docs/legal", file), "utf8"))}<footer>Versión técnica ${commit}. Preparación para revisión; no presentada.</footer></body></html>`);
    await page.pdf({ path: path.join(output, file.replace(/\.md$/, ".pdf")), format: "A4", printBackground: true });
    await page.close();
  }
} finally { await browser.close(); }
function allFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? allFiles(path.join(directory, e.name), path.posix.join(prefix, e.name)) : [path.posix.join(prefix, e.name)]);
}
writeFileSync(path.join(output, "LEEME.txt"), `Exportación técnica completada de ${commit}. Verificar SHA256SUMS.txt antes de utilizar. Contiene borradores y evidencia para revisión; no constituye presentación, pago, registro ni certificación de autoría. Los datos personales y la presentación oficial siguen pendientes según los documentos.\n`);
writeFileSync(path.join(output, "COMPLETADO.json"), JSON.stringify({ commit, archive: path.basename(archive), sourceFiles: selected.length, officialFiling: false }, null, 2) + "\n");
writeFileSync(path.join(output, "SHA256SUMS.txt"), allFiles(output).sort().map(file => `${sha(readFileSync(path.join(output, file)))}  ${file}`).join("\n") + "\n");
console.log(JSON.stringify({ output, commit, sourceFiles: selected.length, excludedAssets: excluded.length, archiveBytes: lstatSync(archive).size, apiExecutable: process.argv.includes("--api-executable"), webBuild: process.argv.includes("--web-build"), platform: os.platform() }));
