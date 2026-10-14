import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema/index.js";

export type Schema = typeof schema;

/** Synchronous SQLite database (Durable Object storage in prod, better-sqlite3 in tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<"sync", any, Schema>;
/** Transaction handle passed to `db.transaction((tx) => ...)`. The callback must be synchronous. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** SQLite caps bound parameters per statement (100 on Durable Object SQL storage). */
export const SQLITE_MAX_PARAMS = 100;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

/** Max rows per multi-row INSERT for a table with `columnCount` bound columns (>= 1). */
export function rowsPerInsert(columnCount: number): number {
  return Math.max(1, Math.floor(SQLITE_MAX_PARAMS / Math.max(1, columnCount)));
}

/** Runs `fn` per chunk of at most `size` values (default 90) and concatenates results. For inArray. */
export function inChunks<T, R>(values: readonly T[], fn: (part: T[]) => R[], size = 90): R[] {
  const out: R[] = [];
  for (const part of chunk(values, size)) out.push(...fn(part));
  return out;
}
