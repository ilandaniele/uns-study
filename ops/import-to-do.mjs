#!/usr/bin/env node
// Imports NDJSON exported by ops/backup-do.ps1 into the Durable Object
// through /api/v1/__ops/import, in FK order, then compares row counts. Exits 1 on any mismatch.
// OPS_IMPORT_TOKEN is read from the environment and never printed.
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const USAGE = `Usage: OPS_IMPORT_TOKEN=<token> node ops/import-to-do.mjs --base <url> --dir <exportDir> [--mode insert|replace]

  --base   Origin of the deployed API, e.g. https://saladeestudio.com.ar
  --dir    Folder with one <table>.ndjson per table
  --mode   insert (default) or replace (deletes each table's rows before importing it)
  --help   Show this help

Tables are imported in the FK-safe order reported by GET /api/v1/__ops/tables, 500 rows per request.
Tables without a file are treated as empty. Exit code 0 only when every table count matches its file.`;

const BATCH = 500;

function parseArgs(argv) {
  const out = { mode: "insert" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--dir") out.dir = argv[++i];
    else if (a === "--mode") out.mode = argv[++i];
    else throw new Error(`Unknown argument ${a}`);
  }
  return out;
}

async function* readRows(file) {
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const token = process.env.OPS_IMPORT_TOKEN;
  if (!args.base || !args.dir) throw new Error("--base and --dir are required (see --help).");
  if (!token) throw new Error("Set OPS_IMPORT_TOKEN in the environment.");
  if (args.mode !== "insert" && args.mode !== "replace") throw new Error("--mode must be insert or replace.");
  if (!existsSync(args.dir)) throw new Error(`Directory not found: ${args.dir}`);

  const api = `${args.base.replace(/\/$/, "")}/api/v1/__ops`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const call = async (path, init = {}) => {
    const res = await fetch(`${api}/${path}`, { ...init, headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${text.slice(0, 300)}`);
    return JSON.parse(text);
  };

  const { tables } = await call("tables");
  const expected = new Map();
  for (const { name } of tables) {
    const file = join(args.dir, `${name}.ndjson`);
    let total = 0;
    if (existsSync(file)) {
      let batch = [];
      let first = true;
      const flush = async () => {
        // "replace" empties the table with the first request; later ones append.
        const mode = args.mode === "replace" && first ? "replace" : "insert";
        await call("import", { method: "POST", body: JSON.stringify({ table: name, rows: batch, mode }) });
        first = false;
        batch = [];
      };
      for await (const row of readRows(file)) {
        batch.push(row);
        total++;
        if (batch.length === BATCH) await flush();
      }
      if (batch.length > 0) await flush();
      else if (args.mode === "replace") await call("import", { method: "POST", body: JSON.stringify({ table: name, rows: [], mode: "replace" }) });
    }
    expected.set(name, total);
    console.log(`${name}: ${total} rows sent`);
  }

  const after = await call("tables");
  let mismatches = 0;
  for (const { name, count } of after.tables) {
    const want = expected.get(name) ?? 0;
    if (count !== want) {
      mismatches++;
      console.error(`MISMATCH ${name}: file ${want}, database ${count}`);
    }
  }
  if (mismatches > 0) {
    console.error(`${mismatches} table(s) differ.`);
    return 1;
  }
  console.log("All table counts match.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
