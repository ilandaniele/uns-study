import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { insertUsers } from "../test-utils.js";

describe("owner account deletion HTTP boundary", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let actor: "owner" | "admin" | "plain" | null;
  const body = { email: "plain@example.test", confirmation: "ELIMINAR" };

  beforeEach(async () => {
    fixture = buildTestApp();
    await insertUsers(fixture.db, ["owner", "admin", "plain"]);
    await fixture.db.update(schema.user).set({ email: "ilan.daniele@gmail.com", emailVerified: true }).where(eq(schema.user.id, "owner"));
    await fixture.db.insert(schema.userRoles).values([{ userId: "owner", role: "ADMIN" }, { userId: "admin", role: "ADMIN" }]);
    actor = "owner";
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, name: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });

  function remove(data: unknown = body, origin?: string) {
    return app.request("/api/v1/admin/users/plain/delete", {
      method: "POST", headers: baseHeaders({ "content-type": "application/json", ...(origin ? { origin } : {}) }), body: JSON.stringify(data),
    });
  }

  it("rejects anonymous, ordinary accounts and admins other than the owner", async () => {
    actor = null; expect((await remove()).status).toBe(401);
    actor = "plain"; expect((await remove()).status).toBe(403);
    actor = "admin"; expect((await remove()).status).toBe(403);
    expect(await fixture.db.select().from(schema.user)).toHaveLength(3);
  });

  it("requires explicit confirmation, exact current email and a trusted origin", async () => {
    expect((await remove({ email: body.email })).status).toBe(400);
    expect((await remove({ ...body, confirmation: "NO" })).status).toBe(400);
    expect((await remove({ ...body, email: "neighbor@example.test" })).status).toBe(400);
    expect((await remove(body, "https://untrusted.example")).status).toBe(403);
    expect(await fixture.db.select().from(schema.user)).toHaveLength(3);
  });

  it("rate limits deletion and deletes just once through the real service", async () => {
    const limiter = vi.spyOn(fixture.services.rateLimit, "check");
    limiter.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect((await remove()).status).toBe(429);
    limiter.mockRestore();
    expect((await remove()).status).toBe(200);
    expect((await remove()).status).toBe(404);
    expect(await fixture.db.select().from(schema.user)).toHaveLength(2);
  });
});
