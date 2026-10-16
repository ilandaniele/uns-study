const MAX_CAUSE_DEPTH = 8;

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
}

/** The error and its `.cause` chain (drizzle wraps driver errors), outermost first. */
function chain(err: unknown): ErrorLike[] {
  const out: ErrorLike[] = [];
  let cur: unknown = err;
  while (typeof cur === "object" && cur !== null && out.length < MAX_CAUSE_DEPTH) {
    out.push(cur as ErrorLike);
    cur = (cur as ErrorLike).cause;
  }
  return out;
}

/** better-sqlite3 sets `code`; the DO SqlStorage only embeds the SQLite text in `message`. */
function find(err: unknown, codes: readonly string[], text: string): ErrorLike | undefined {
  return chain(err).find((e) => {
    const message = typeof e.message === "string" ? e.message : "";
    return (typeof e.code === "string" && codes.includes(e.code)) || message.includes(text);
  });
}

/**
 * True for SQLITE_CONSTRAINT_UNIQUE / "UNIQUE constraint failed" (better-sqlite3 and DO SqlStorage),
 * following `.cause` chains. When `targets` is given, at least one must appear in the driver's
 * message: "table.column" for column indexes, the index name for expression indexes.
 */
export function isUniqueViolation(err: unknown, targets?: string[]): boolean {
  const hit = find(err, ["SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_PRIMARYKEY"], "UNIQUE constraint failed");
  if (!hit) return false;
  if (!targets || targets.length === 0) return true;
  const message = typeof hit.message === "string" ? hit.message : "";
  return targets.some((t) => message.includes(t));
}

export function isForeignKeyViolation(err: unknown): boolean {
  return find(err, ["SQLITE_CONSTRAINT_FOREIGNKEY"], "FOREIGN KEY constraint failed") !== undefined;
}

export function isCheckViolation(err: unknown): boolean {
  return find(err, ["SQLITE_CONSTRAINT_CHECK"], "CHECK constraint failed") !== undefined;
}

const MISSING_SCHEMA_TEXTS = ["no such table", "no such column", "has no column named"];

/** True for "no such table", "no such column", "has no column named" anywhere in the err/.cause chain. */
export function isMissingSchemaError(err: unknown): boolean {
  return chain(err).some((e) => {
    const message = typeof e.message === "string" ? e.message : "";
    return MISSING_SCHEMA_TEXTS.some((text) => message.includes(text));
  });
}

const loggedMissingSchema = new Set<string>();

function noteMissingSchema(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (loggedMissingSchema.has(message)) return;
  loggedMissingSchema.add(message);
  console.warn(JSON.stringify({ evt: "missing_schema", msg: message }));
}

/** Runs fn; on a missing-schema error returns fallback (and logs once per process per message). Rethrows anything else. */
export async function orDefault<T>(fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isMissingSchemaError(err)) throw err;
    noteMissingSchema(err);
    return fallback;
  }
}

/** Sync variant for use inside db.transaction callbacks. */
export function orDefaultSync<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    if (!isMissingSchemaError(err)) throw err;
    noteMissingSchema(err);
    return fallback;
  }
}
