import type { Context } from "hono";

/** Nest response semantics: null/undefined -> empty body with `status`; objects/arrays -> JSON; default status 200. */
export function reply(c: Context, value: unknown, status = 200): Response {
  if (value === null || value === undefined) return c.body(null, status as never);
  if (typeof value === "string") return c.text(value, status as never);
  return c.json(value, status as never);
}
