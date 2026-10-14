import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { getTableName } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { freshDb } from "../test-utils.js";
import { handleOps, orderedTables } from "./ops-handler.js";

const TOKEN = "s3cret-token";
const e = { opsImportToken: TOKEN };

function call(db: Db, path: string, init: RequestInit & { token?: string | null } = {}, env = e) {
  const { token = TOKEN, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return handleOps(new Request(`http://do${path}`, { ...rest, headers }), db, env);
}

function post(db: Db, body: unknown) {
  return call(db, "/api/v1/__ops/import", { method: "POST", body: JSON.stringify(body) });
}

const userRow = (n: number) => ({
  id: `u${n}`,
  name: `User ${n}`,
  email: `u${n}@example.test`,
  email_verified: n % 2 === 0,
  image: null,
  created_at: "2026-01-02T03:04:05.678+00:00",
  updated_at: 1_767_323_045_678,
});

describe("handleOps", () => {
  let db: Db;
  beforeEach(() => {
    db = freshDb();
  });

  it("ignores paths outside /api/v1/__ops/", async () => {
    expect(await call(db, "/api/v1/health")).toBeNull();
  });

  it("is disabled (404) when the token is empty", async () => {
    const res = await call(db, "/api/v1/__ops/tables", {}, { opsImportToken: "" });
    expect(res?.status).toBe(404);
  });

  it("requires the bearer token", async () => {
    expect((await call(db, "/api/v1/__ops/tables", { token: null }))?.status).toBe(401);
    expect((await call(db, "/api/v1/__ops/tables", { token: "wrong" }))?.status).toBe(401);
    expect((await call(db, "/api/v1/__ops/tables"))?.status).toBe(200);
  });

  it("lists tables in FK-safe order with counts", async () => {
    const res = await call(db, "/api/v1/__ops/tables");
    const { tables } = (await res!.json()) as { tables: { name: string; count: number }[] };
    const names = tables.map((t) => t.name);
    expect(names).not.toContain("scheduled_jobs");
    expect(tables.find((t) => t.name === "seats")?.count).toBe(108);

    const position = new Map(names.map((n, i) => [n, i]));
    for (const { table } of orderedTables()) {
      for (const fk of getTableConfig(table).foreignKeys) {
        const parent = getTableName(fk.reference().foreignTable);
        if (parent === getTableName(table)) continue;
        expect(position.get(parent), `${parent} before ${getTableName(table)}`).toBeLessThan(position.get(getTableName(table))!);
      }
    }
  });

  it("imports rows converting timestamps, booleans and chunking past 100 parameters", async () => {
    const rows = Array.from({ length: 300 }, (_, i) => userRow(i));
    const res = await post(db, { table: "user", rows });
    expect(res?.status).toBe(200);
    expect(await res!.json()).toEqual({ inserted: 300 });

    const stored = db.select().from(schema.user).where(eq(schema.user.id, "u2")).all()[0]!;
    expect(stored.emailVerified).toBe(true);
    expect(stored.createdAt.toISOString()).toBe("2026-01-02T03:04:05.678Z");
    expect(stored.updatedAt.getTime()).toBe(1_767_323_045_678);
  });

  it("converts blobs from hex and $b64, and exports them as $b64", async () => {
    await post(db, { table: "user", rows: [userRow(1), userRow(2)] });
    const res = await post(db, {
      table: "user_avatars",
      rows: [
        { user_id: "u1", mime_type: "image/png", bytes: "\\x0102ff", sha256: "a", updated_at: 1_767_323_045_678 },
        { user_id: "u2", mime_type: "image/png", bytes: { $b64: Buffer.from([9, 8, 7]).toString("base64") }, sha256: "b", updated_at: 1_767_323_045_678 },
      ],
    });
    expect(res?.status).toBe(200);
    const [a, b] = db.select().from(schema.userAvatars).orderBy(schema.userAvatars.userId).all();
    expect([...a!.bytes]).toEqual([1, 2, 255]);
    expect([...b!.bytes]).toEqual([9, 8, 7]);

    const exported = (await (await call(db, "/api/v1/__ops/export?table=user_avatars"))!.json()) as { rows: Record<string, unknown>[]; next: number | null };
    expect(exported.rows[0]!.bytes).toEqual({ $b64: Buffer.from([1, 2, 255]).toString("base64") });
    expect(exported.next).toBeNull();
  });

  it("derives alias_lower when absent", async () => {
    await post(db, { table: "user", rows: [userRow(1)] });
    const res = await post(db, {
      table: "user_profiles",
      rows: [{ user_id: "u1", identity_mode: "HIDDEN", alias: "Zorro Veloz", created_at: 1, updated_at: 1 }],
    });
    expect(res?.status).toBe(200);
    expect(db.select().from(schema.userProfiles).all()[0]?.aliasLower).toBe("zorro veloz");
  });

  it("replace mode deletes the table's rows first", async () => {
    await post(db, { table: "user", rows: [userRow(1), userRow(2)] });
    const res = await post(db, { table: "user", rows: [userRow(3)], mode: "replace" });
    expect(await res!.json()).toEqual({ inserted: 1 });
    expect(db.select().from(schema.user).all().map((u) => u.id)).toEqual(["u3"]);
  });

  it("rejects a bad batch atomically and reports the failing row index", async () => {
    const res = await post(db, { table: "user", rows: [userRow(1), userRow(2), userRow(1)] });
    expect(res?.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("Fila 2");
    expect(db.select().from(schema.user).all()).toHaveLength(0);
  });

  it("validates input: unknown table/column, row cap, mode", async () => {
    expect((await post(db, { table: "nope", rows: [] }))?.status).toBe(400);
    expect((await post(db, { table: "user", rows: [{ id: "x", bogus: 1 }] }))?.status).toBe(400);
    expect((await post(db, { table: "user", rows: Array.from({ length: 501 }, (_, i) => userRow(i)) }))?.status).toBe(400);
    expect((await post(db, { table: "user", rows: [], mode: "merge" }))?.status).toBe(400);
  });

  it("defers foreign keys during import (child rows before parents in one request set)", async () => {
    const res = await post(db, {
      table: "user_profiles",
      rows: [{ user_id: "later", identity_mode: "HIDDEN", created_at: 1, updated_at: 1 }],
    });
    // The parent never arrives: the commit-time FK check must reject it.
    expect(res?.status).toBeGreaterThanOrEqual(400);
    expect(db.select().from(schema.userProfiles).all()).toHaveLength(0);
  });

  it("exports in pages by rowid", async () => {
    await post(db, { table: "user", rows: Array.from({ length: 5 }, (_, i) => userRow(i)) });
    const first = (await (await call(db, "/api/v1/__ops/export?table=user&limit=3"))!.json()) as { rows: { id: string }[]; next: number | null };
    expect(first.rows.map((r) => r.id)).toEqual(["u0", "u1", "u2"]);
    expect(first.next).not.toBeNull();
    const second = (await (await call(db, `/api/v1/__ops/export?table=user&limit=3&after=${first.next}`))!.json()) as { rows: { id: string; email_verified: boolean }[]; next: number | null };
    expect(second.rows.map((r) => r.id)).toEqual(["u3", "u4"]);
    expect(second.rows[0]!.email_verified).toBe(false);
    expect(second.next).toBeNull();
  });
});
