import type { MiddlewareHandler } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { ApiErrors } from "../common/api-error.js";
import type { AppEnv } from "./context.js";

const uuidSchema = z.string().uuid();

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiErrors.validation(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}

/** Validates the JSON body against a zod schema; read it with `c.req.valid("json")`. */
export function zBody<T extends z.ZodTypeAny>(schema: T) {
  return validator("json", async (_value, c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw ApiErrors.validation("Datos inválidos.");
    }
    return parse(schema, raw);
  }) as unknown as MiddlewareHandler<AppEnv, string, { in: { json: z.input<T> }; out: { json: z.output<T> } }>;
}

/** Validates the query string against a zod schema; read it with `c.req.valid("query")`. */
export function zQuery<T extends z.ZodTypeAny>(schema: T) {
  return validator("query", (value) => parse(schema, value)) as unknown as MiddlewareHandler<
    AppEnv,
    string,
    { in: { query: z.input<T> }; out: { query: z.output<T> } }
  >;
}

/** Validates route params as UUIDs, throwing the shared `VALIDATION_ERROR` shape instead of
 *  falling through to the database with a malformed id. */
export function uuidParam(...names: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    for (const name of names) {
      if (!uuidSchema.safeParse(c.req.param(name)).success) throw ApiErrors.validation("Identificador inválido.");
    }
    await next();
  };
}
