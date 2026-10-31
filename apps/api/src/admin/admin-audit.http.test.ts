import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { Auth } from "../auth/auth.instance.js";
import { env } from "../env.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { insertUsers } from "../test-utils.js";

describe("owner audit cleanup HTTP boundary", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let actor: string | null;
  let savedOwner: string;
  beforeEach(async () => {
    savedOwner = env.ownerEmail; env.ownerEmail = "owner@example.test";
    fixture = buildTestApp();
    await insertUsers(fixture.db, ["owner", "admin", "moderator", "plain"]);
    await fixture.db.update(schema.user).set({ emailVerified: true });
    await fixture.db.update(schema.user).set({ email: env.ownerEmail }).where(eq(schema.user.id, "owner"));
    await fixture.db.insert(schema.userRoles).values([{ userId: "owner", role: "ADMIN" }, { userId: "admin", role: "ADMIN" }, { userId: "moderator", role: "MODERATOR" }]);
    await fixture.db.insert(schema.moderationActions).values({ actorId: "admin", action: "WARN", createdAt: new Date(Date.now() - 1000) });
    actor = "owner";
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });
  afterEach(() => { env.ownerEmail = savedOwner; });
  const confirmation = { confirmation: "DELETE_EXISTING_AUDIT" };
  function clear(body: unknown = confirmation, origin = "http://localhost:3000") {
    return app.request("/api/v1/admin/audit", { method: "DELETE", headers: baseHeaders({ "content-type": "application/json", origin }), body: JSON.stringify(body) });
  }
  it("rejects other roles, unauthenticated callers and an unverified owner without deleting history", async () => {
    for (const id of ["admin", "moderator", "plain", null]) {
      actor = id; expect((await clear()).status).toBe(id ? 403 : 401);
    }
    actor = "owner";
    await fixture.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "owner"));
    expect((await clear()).status).toBe(403);
    expect(await fixture.db.select().from(schema.moderationActions)).toHaveLength(1);
  });
  it("requires the exact confirmation and trusted origin", async () => {
    expect((await clear({})).status).toBe(400);
    expect((await clear({ ...confirmation, userId: "owner" })).status).toBe(400);
    expect((await clear(confirmation, "https://outside.example.test")).status).toBe(403);
    expect(await fixture.db.select().from(schema.moderationActions)).toHaveLength(1);
  });
  it("lets the authenticated superadmin clear only existing history and records the cleanup", async () => {
    const response = await clear(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ count: 1 });
    expect(await fixture.db.select().from(schema.moderationActions)).toMatchObject([{ actorId: "owner", action: "AUDIT_CLEARED" }]);
  });
});
