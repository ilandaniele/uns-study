// Node twin of ops/export-fly-pg.ps1 for machines without psql: exports every table of the Fly
// Postgres database to one NDJSON file per table (row_to_json), the input of ops/import-to-do.mjs.
// Skips app_secrets (see ops/copy-app-secrets.ps1), the old realtime adapter table
// (socket_io_attachments) and drizzle's migration log. Nothing secret is printed.
// Usage: open `fly proxy 15432:5432 -a sala-de-estudio-db` yourself, put the URL (host localhost:15432)
// in an env var for this run only, then:
//   $env:SOURCE_DATABASE_URL = "<postgres url through the proxy>"
//   node ops/export-fly-pg.mjs --out C:\path\export [--url-var SOURCE_DATABASE_URL]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = { urlVar: "SOURCE_DATABASE_URL" };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--out") args.out = process.argv[++i];
  else if (a === "--url-var") args.urlVar = process.argv[++i];
  else throw new Error(`Unknown argument ${a}`);
}
if (!args.out) throw new Error("Pass --out <dir>.");
const url = process.env[args.urlVar];
if (!url) throw new Error(`Set $env:${args.urlVar} to the Postgres connection URL first.`);

// pg is not a direct dependency of any workspace package; load it from the pnpm store.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = join(repo, "node_modules", ".pnpm");
const pgDir = readdirSync(store).find((d) => /^pg@\d/.test(d));
if (!pgDir) throw new Error("pg not found in node_modules/.pnpm. Run pnpm install.");
const { Client } = createRequire(join(store, pgDir, "node_modules", "pg", "package.json"))("pg");

const skip = new Set(["app_secrets", "socket_io_attachments", "__drizzle_migrations"]);
const outAbs = resolve(args.out);
mkdirSync(outAbs, { recursive: true });

const client = new Client({ connectionString: url });
await client.connect();
try {
  const { rows: tables } = await client.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  for (const { tablename: table } of tables) {
    if (skip.has(table)) continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Unexpected table name '${table}'.`);
    // ::text keeps Postgres' own JSON rendering (same as the psql export), no driver type parsing.
    const { rows } = await client.query(`select row_to_json(t)::text as j from "${table}" t`);
    writeFileSync(join(outAbs, `${table}.ndjson`), rows.map((r) => r.j + "\n").join(""));
    console.log(`${table} : ${rows.length} rows`);
  }
} finally {
  await client.end();
}
console.log(`Export done in ${outAbs}`);
