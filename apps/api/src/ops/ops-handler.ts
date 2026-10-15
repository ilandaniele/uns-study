import { createHash } from "node:crypto";
import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { SQLiteTable, getTableConfig, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { chunk, rowsPerInsert, schema, type Db } from "@sala/database";
import { ApiErrors, ApiException, toErrorResponse } from "../common/api-error.js";
import type { Env } from "../env.js";

/** Data-migration endpoints (docs/cloudflare-migration/BLUEPRINT.md 2.12). Handled before the Hono app. */

const OPS_PREFIX = "/api/v1/__ops/";
const MAX_IMPORT_ROWS = 500;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_EXPORT_LIMIT = 1000;
const DEFAULT_EXPORT_LIMIT = 500;

/** Tables that are never imported or exported: they are rebuilt by the Durable Object itself. */
const EXCLUDED_TABLES = new Set(["scheduled_jobs"]);

type AnyTable = SQLiteTable;

interface TableInfo {
  name: string;
  table: AnyTable;
  /** SQL column name -> [drizzle property key, column]. */
  columns: Map<string, { key: string; column: AnySQLiteColumn }>;
}

let cachedTables: TableInfo[] | null = null;

/** Every schema table in FK-safe insert order (parents first), from drizzle's table config. */
export function orderedTables(): TableInfo[] {
  if (cachedTables) return cachedTables;
  const all = (Object.values(schema) as unknown[])
    .filter((t): t is AnyTable => is(t, SQLiteTable))
    .filter((t) => !EXCLUDED_TABLES.has(getTableName(t)))
    .sort((a, b) => (getTableName(a) < getTableName(b) ? -1 : 1));
  const byName = new Map(all.map((t) => [getTableName(t), t]));

  const ordered: AnyTable[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (table: AnyTable): void => {
    const name = getTableName(table);
    if (state.has(name)) return; // done, or a cycle: break it (defer_foreign_keys covers the rest)
    state.set(name, "visiting");
    for (const fk of getTableConfig(table).foreignKeys) {
      const parent = byName.get(getTableName(fk.reference().foreignTable));
      if (parent && parent !== table) visit(parent);
    }
    state.set(name, "done");
    ordered.push(table);
  };
  for (const table of all) visit(table);

  cachedTables = ordered.map((table) => {
    const columns = new Map<string, { key: string; column: AnySQLiteColumn }>();
    for (const [key, column] of Object.entries(getTableColumns(table))) columns.set(column.name, { key, column });
    return { name: getTableName(table), table, columns };
  });
  return cachedTables;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/** Constant-time over equal lengths (the length of a random 256-bit token is not a secret). */
function tokenMatches(header: string | null, expected: string): boolean {
  const presented = bearerOf(header);
  const want = expected.trim();
  if (!presented || !want || presented.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= presented.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

function bearerOf(header: string | null): string {
  return /^Bearer\s+(.+)$/i.exec((header ?? "").trim())?.[1]?.trim() ?? "";
}

function sha8(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function bytesOf(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("not a blob");
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fail(message: string): never {
  throw ApiErrors.validation(message);
}

/** Converts one JSON import value to the JS value drizzle's column mapper expects. */
function fromImport(column: AnySQLiteColumn, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (column.dataType) {
    case "date": {
      if (typeof value !== "string" && typeof value !== "number") fail(`${column.name}: timestamp inválido.`);
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) fail(`${column.name}: timestamp inválido.`);
      return date;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === 1 || value === "t" || value === "true") return true;
      if (value === 0 || value === "f" || value === "false") return false;
      return fail(`${column.name}: booleano inválido.`);
    case "number":
      if (typeof value === "string") {
        const n = Number(value);
        if (Number.isNaN(n)) fail(`${column.name}: número inválido.`);
        return n;
      }
      return value;
    case "custom":
      // bytea: "\\x<hex>" (pg row_to_json) or { "$b64": "..." } (this endpoint's own export)
      if (typeof value === "string" && value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
      if (typeof value === "object" && typeof (value as { $b64?: unknown }).$b64 === "string") return Buffer.from((value as { $b64: string }).$b64, "base64");
      return fail(`${column.name}: blob inválido.`);
    default:
      return value;
  }
}

/** Converts a raw driver row value to its export representation. */
function toExport(column: AnySQLiteColumn, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (column.dataType) {
    case "boolean":
      return value === 1 || value === true;
    case "json":
      return typeof value === "string" ? JSON.parse(value) : value;
    case "custom":
      return { $b64: toBase64(bytesOf(value)) };
    default:
      return value;
  }
}

/** Fills `<x>_lower` columns that the pg export does not have. */
function addDerived(info: TableInfo, row: Record<string, unknown>): void {
  for (const sqlName of info.columns.keys()) {
    if (!sqlName.endsWith("_lower") || row[sqlName] !== undefined) continue;
    const source = row[sqlName.slice(0, -"_lower".length)];
    if (typeof source === "string") row[sqlName] = source.toLowerCase();
  }
}

function convertRow(info: TableInfo, raw: unknown, index: number): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail(`Fila ${index}: debe ser un objeto.`);
  const row = { ...(raw as Record<string, unknown>) };
  addDerived(info, row);
  const out: Record<string, unknown> = {};
  for (const [sqlName, value] of Object.entries(row)) {
    const target = info.columns.get(sqlName);
    if (!target) fail(`Fila ${index}: columna desconocida ${info.name}.${sqlName}.`);
    if (value === undefined) continue;
    try {
      out[target.key] = fromImport(target.column, value);
    } catch (err) {
      if (err instanceof ApiException) throw ApiErrors.validation(`Fila ${index}: ${err.message}`);
      throw err;
    }
  }
  return out;
}

class ImportRowError extends Error {
  constructor(
    readonly index: number,
    cause: unknown,
  ) {
    super(`Fila ${index}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function findTable(name: unknown): TableInfo {
  const info = typeof name === "string" ? orderedTables().find((t) => t.name === name) : undefined;
  if (!info) fail("Tabla desconocida.");
  return info;
}

function handleTables(db: Db): Response {
  const tables = orderedTables().map((t) => {
    const row = db.all<{ c: number }>(sql`SELECT count(*) AS c FROM ${sql.identifier(t.name)}`)[0];
    return { name: t.name, count: row?.c ?? 0 };
  });
  return json({ tables });
}

async function handleImport(req: Request, db: Db): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_IMPORT_BYTES) throw new ApiException("VALIDATION_ERROR", "El cuerpo supera los 5 MB.", 413);
  let body: { table?: unknown; rows?: unknown; mode?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail("JSON inválido.");
  }
  const info = findTable(body.table);
  if (!Array.isArray(body.rows)) fail("rows debe ser un array.");
  if (body.rows.length > MAX_IMPORT_ROWS) fail(`Máximo ${MAX_IMPORT_ROWS} filas por pedido.`);
  const mode = body.mode ?? "insert";
  if (mode !== "insert" && mode !== "replace") fail("mode inválido.");

  const rows = body.rows.map((raw, i) => convertRow(info, raw, i));
  const perInsert = rowsPerInsert(info.columns.size);
  const table = info.table as AnyTable & Parameters<Db["insert"]>[0];

  try {
    const inserted = db.transaction((tx) => {
      tx.run(sql`PRAGMA defer_foreign_keys = ON`);
      if (mode === "replace") tx.delete(table).run();
      let count = 0;
      let offset = 0;
      for (const part of chunk(rows, perInsert)) {
        try {
          tx.insert(table).values(part as never).run();
        } catch (err) {
          // Find the offending row (each statement is atomic); the throw rolls the whole import back.
          for (const [i, row] of part.entries()) {
            try {
              tx.insert(table).values(row as never).run();
            } catch (rowErr) {
              throw new ImportRowError(offset + i, rowErr);
            }
          }
          throw err;
        }
        count += part.length;
        offset += part.length;
      }
      return count;
    });
    return json({ inserted });
  } catch (err) {
    if (err instanceof ImportRowError) throw ApiErrors.validation(err.message);
    throw err;
  }
}

function handleExport(url: URL, db: Db): Response {
  const info = findTable(url.searchParams.get("table"));
  const after = Number(url.searchParams.get("after") ?? 0);
  const requested = Number(url.searchParams.get("limit") ?? DEFAULT_EXPORT_LIMIT);
  if (!Number.isFinite(after) || after < 0) fail("after inválido.");
  const limit = Math.min(MAX_EXPORT_LIMIT, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_EXPORT_LIMIT));

  const raw = db.all<Record<string, unknown>>(
    sql`SELECT rowid AS __rowid, * FROM ${sql.identifier(info.name)} WHERE rowid > ${after} ORDER BY rowid LIMIT ${limit}`,
  );
  let last: number | null = null;
  const rows = raw.map((r) => {
    last = Number(r.__rowid);
    const out: Record<string, unknown> = {};
    for (const [sqlName, { column }] of info.columns) out[sqlName] = toExport(column, r[sqlName]);
    return out;
  });
  return json({ rows, next: rows.length === limit ? last : null });
}

/**
 * Returns `null` for paths outside `/api/v1/__ops/` (the caller falls through to the app), a 404 when
 * the feature is disabled (`OPS_IMPORT_TOKEN` empty), a 401 without the bearer token, else the response.
 */
export async function handleOps(req: Request, db: Db, e: Pick<Env, "opsImportToken">): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(OPS_PREFIX)) return null;
  const notFound = () => json({ error: { code: "NOT_FOUND", message: "No encontrado." } }, 404);
  if (!e.opsImportToken) return notFound();
  if (!tokenMatches(req.headers.get("authorization"), e.opsImportToken)) {
    // Length and a 32-bit hash prefix of the configured token let the cutover script tell a stale
    // value from a malformed one without revealing anything usable about a 256-bit token.
    const expected = e.opsImportToken.trim();
    const presented = bearerOf(req.headers.get("authorization"));
    const diag = {
      expectedLength: expected.length,
      expectedSha8: sha8(expected),
      presentedLength: presented.length,
      presentedSha8: presented ? sha8(presented) : "",
    };
    return json({ error: { code: "UNAUTHENTICATED", message: "Token inválido." }, diag }, 401);
  }

  const route = url.pathname.slice(OPS_PREFIX.length);
  try {
    if (route === "tables" && req.method === "GET") return handleTables(db);
    if (route === "import" && req.method === "POST") return await handleImport(req, db);
    if (route === "export" && req.method === "GET") return handleExport(url, db);
    return notFound();
  } catch (err) {
    const { status, body } = toErrorResponse(err, { method: req.method, path: url.pathname });
    return json(body, status);
  }
}
