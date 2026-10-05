const UNIQUE_VIOLATION = "23505";

/** True when `err` (or its wrapped `cause`, as drizzle surfaces driver errors) is a Postgres unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: string }).code === UNIQUE_VIOLATION;
}
