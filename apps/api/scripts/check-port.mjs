#!/usr/bin/env node
// Usage: node apps/api/scripts/check-port.mjs <path…>
// Exits 1 when a non-test .ts file under the given paths contains a banned pattern
// (docs/cloudflare-migration/BLUEPRINT.md, appendix A.2). Prints `file:line:pattern`.
// Per-file allow comment: `// check-port-allow: <pattern> <reason>`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const PATTERNS = [
  /@nestjs\//, /reflect-metadata/, /from "express"/, /from "pg"/, /@electric-sql\/pglite/,
  /ioredis/, /@upstash\//, /socket\.io/, /web-push/, /@aws-sdk\//,
  /helmet/, /transaction\(async/, /\.for\("update"\)/, /pg_advisory/, /SKIP LOCKED/,
  /::int/, /::text/, /::uuid/, /::date/, /::numeric/, /\bILIKE\b/, /DISTINCT ON/,
  /AT TIME ZONE/, /date_trunc/, /= ANY\(/, /(?<![.\w])now\(\)/, /jsonb/,
  /fly-client-ip/, /x-sala-client-ip/, /PROXY_SHARED_SECRET/, /fly\.dev/, /PGLITE/,
].map((re) => ({ source: re.source, re }));

const ALLOW = /check-port-allow:\s*(\S+)/g;

function* walk(target) {
  const st = statSync(target, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isFile()) {
    yield target;
    return;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    yield* walk(path.join(target, entry.name));
  }
}

const isChecked = (f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !/\.test\.ts$/.test(f);

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("usage: check-port.mjs <path…>");
  process.exit(2);
}

let failures = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    if (!isChecked(file)) continue;
    const text = readFileSync(file, "utf8");
    const allowed = new Set([...text.matchAll(ALLOW)].map((m) => m[1]));
    text.split(/\r?\n/).forEach((line, i) => {
      if (line.includes("check-port-allow:")) return;
      for (const { source, re } of PATTERNS) {
        if (allowed.has(source)) continue;
        if (re.test(line)) {
          console.log(`${file}:${i + 1}:${source}`);
          failures++;
        }
      }
    });
  }
}
process.exit(failures > 0 ? 1 : 0);
