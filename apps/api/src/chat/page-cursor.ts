import { and, eq, getTableColumns, lt, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

/**
 * Keyset cursor for newest-first message pages. Timestamps are whole milliseconds, so two messages
 * can share `created_at`; the table's rowid (insertion order) breaks the tie. The cursor string is
 * opaque to clients: `<iso>#<rowid>`. A bare ISO string (older clients) still pages by time alone.
 */
interface ParsedCursor {
  at: Date;
  rowid: number | null;
}

export function formatCursor(createdAt: Date, rowid: number): string {
  return `${createdAt.toISOString()}#${rowid}`;
}

function parseCursor(cursor: string | null | undefined): ParsedCursor | null {
  if (!cursor) return null;
  const [iso, rest] = cursor.split("#");
  const at = new Date(iso ?? "");
  if (Number.isNaN(at.getTime())) return null;
  const rowid = rest === undefined ? null : Number(rest);
  return { at, rowid: rowid !== null && Number.isSafeInteger(rowid) ? rowid : null };
}

/** `SELECT` list for a message table: every column plus its rowid (needed to build the next cursor). */
export function withRowid<T extends SQLiteTable>(table: T) {
  return { ...getTableColumns(table), rowid: sql<number>`${table}.rowid`.mapWith(Number).as("rowid") };
}

/** Condition selecting rows strictly older than `cursor` in (created_at desc, rowid desc) order; undefined without a cursor. */
export function olderThan(table: SQLiteTable, createdAt: SQLiteColumn, cursor: string | null | undefined): SQL | undefined {
  const parsed = parseCursor(cursor);
  if (!parsed) return undefined;
  if (parsed.rowid === null) return lt(createdAt, parsed.at);
  return or(lt(createdAt, parsed.at), and(eq(createdAt, parsed.at), sql`${table}.rowid < ${parsed.rowid}`));
}

/** `ORDER BY` terms for newest first, ties newest-inserted first. */
export function newestFirst(table: SQLiteTable, createdAt: SQLiteColumn): SQL[] {
  return [sql`${createdAt} desc`, sql`${table}.rowid desc`];
}
