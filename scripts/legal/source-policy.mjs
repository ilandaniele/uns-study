const roots = new Set(["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"]);
const prefixes = ["apps/web/src/", "apps/api/src/", "packages/contracts/", "packages/database/src/", "packages/database/migrations/", "scripts/legal/", "apps/web/scripts/", "docs/legal/"];
const publicPrefixes = ["apps/web/public/garden/", "apps/web/public/avatars/animals/", "apps/web/public/emojis/", "apps/web/public/legal/"];
const configFiles = new Set(["apps/web/package.json", "apps/api/package.json", "packages/database/package.json", "apps/web/tsconfig.json", "apps/api/tsconfig.json", "apps/web/next.config.ts", "apps/web/postcss.config.mjs", "apps/web/open-next.config.ts", "apps/web/public/sw.js", "apps/web/public/ads.txt", "docs/garden-tree-art.md", "docs/garden-expansion.md", "docs/living-garden-video.md"]);
const prohibited = /(^|\/)(\.env[^/]*|\.dev\.vars[^/]*|node_modules|private|backups)(\/|$)|\.(?:sqlite|sqlite3|db|pem|p12|key|pfx|log|csv)$/i;

export function isUncertainAsset(file) {
  return file.startsWith("reference-images/") || file.startsWith("apps/web/public/room/") || file.startsWith("apps/web/public/icons/") || file === "apps/web/public/favicon.ico";
}

export function isSourceEvidencePath(file) {
  if (!file || file.startsWith("/") || /^[a-z]:/i.test(file) || /[\\\r\n\0]/.test(file)) return false;
  if (file.split("/").some(segment => segment === ".." || segment.startsWith("."))) return false;
  if (prohibited.test(file) || isUncertainAsset(file)) return false;
  return roots.has(file) || configFiles.has(file) || [...prefixes, ...publicPrefixes].some(prefix => file.startsWith(prefix));
}
