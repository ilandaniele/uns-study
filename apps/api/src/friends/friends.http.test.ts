import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { FRIEND_REQUEST_COOLDOWN_MS, type FriendsPageDto, type FriendStateDto, type PersonSearchDto, type Page } from "@sala/contracts";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { countQueries, insertUsers } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";

describe("private friends and public-identity search", () => {
  let ctx: ReturnType<typeof buildTestApp>, app: ReturnType<typeof createApp>, actor: string | null;
  const userTarget = (userId = "friend-b") => ({ target: { kind: "user", userId } });
  const request = (path: string, method = "GET", body?: unknown, origin?: string) => app.request(`/api/v1${path}`, {
    method, headers: baseHeaders({ "content-type": "application/json", ...(origin ? { origin } : {}) }), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const send = (body = userTarget()) => request("/me/friends/requests", "POST", body);
  const list = async (view = "friends") => (await (await request(`/me/friends?view=${view}`)).json()) as FriendsPageDto;
  const search = async (query: string) => await (await request(`/people/search?q=${encodeURIComponent(query)}`)).json() as Page<PersonSearchDto>;
  beforeEach(async () => {
    ctx = buildTestApp(); actor = "friend-a";
    await insertUsers(ctx.db, ["friend-a", "friend-b", "friend-c", "friend-hidden", "friend-unverified"]);
    ctx.db.update(schema.user).set({ emailVerified: true }).run();
    ctx.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "friend-unverified")).run();
    for (const id of ["friend-a", "friend-b", "friend-c", "friend-hidden", "friend-unverified"]) {
      const hidden = id === "friend-hidden";
      ctx.db.insert(schema.userProfiles).values({ userId: id, identityMode: hidden ? "HIDDEN" : "FULL_NAME", firstName: hidden ? "SecretName" : id === "friend-b" ? "Álvaro" : id,
        lastName: hidden ? "SecretSurname" : null, alias: hidden ? "Hormiga Curiosa" : `Tortuga ${id}`, aliasLower: hidden ? "hormiga curiosa" : `tortuga ${id}`, aliasAnimal: hidden ? "hormiga" : "tortuga", bio: "PrivateBiography", studentNumber: "PrivateStudentNumber", instagram: "private_instagram" }).run();
      ctx.db.insert(schema.userPrivacySettings).values({ userId: id }).run();
    }
    const auth = { api: { getSession: async () => {
      if (!actor) return null;
      const user = ctx.db.select().from(schema.user).where(eq(schema.user.id, actor)).get();
      return user ? { user } : null;
    } } } as unknown as Auth;
    app = createApp({ services: ctx.services, auth });
  });

  it("creates one pending request under retries and reciprocal requests, then requires recipient consent", async () => {
    const responses = await Promise.all([send(), send()]);
    const sent = await responses[0]!.json() as FriendStateDto;
    expect(sent.state).toBe("OUTGOING"); expect(ctx.db.select().from(schema.friendships).all()).toHaveLength(1);
    expect((await list()).counts).toEqual({ friends: 0, incoming: 0, outgoing: 1 });
    actor = "friend-b"; expect(await (await send(userTarget("friend-a"))).json()).toMatchObject({ state: "INCOMING", friendshipId: sent.friendshipId });
    expect((await list("incoming")).items).toHaveLength(1);
    expect((await request(`/me/friends/requests/${sent.friendshipId}/respond`, "POST", { action: "ACCEPT" })).status).toBe(200);
    expect((await list()).counts.friends).toBe(1); actor = "friend-a"; expect((await list()).counts.friends).toBe(1);
    const events = ctx.hub.eventsFor("friends:changed"); expect(events).toHaveLength(4); expect(events.every(e => e.to.startsWith("user:") && JSON.stringify(e.payload) === "{}")).toBe(true);
  });

  it("only lets the recipient respond and members remove; retries are idempotent", async () => {
    const sent = await (await send()).json() as FriendStateDto; const path = `/me/friends/requests/${sent.friendshipId}/respond`;
    expect((await request(path, "POST", { action: "ACCEPT" })).status).toBe(404);
    actor = "friend-c"; expect((await request(path, "POST", { action: "ACCEPT" })).status).toBe(404); expect((await request(`/me/friends/${sent.friendshipId}`, "DELETE")).status).toBe(404);
    actor = "friend-b"; expect((await request(`/me/friends/${sent.friendshipId}`, "DELETE")).status).toBe(404);
    for (let i = 0; i < 2; i++) expect((await request(path, "POST", { action: "ACCEPT" })).status).toBe(200);
    expect((await request(`/me/friends/${sent.friendshipId}`, "DELETE")).status).toBe(200); expect((await list()).items).toEqual([]);
    expect((await request(`/me/friends/${sent.friendshipId}`, "DELETE")).status).toBe(200);
  });

  it("supports decline/cancel and a resend cooldown; old request ids cannot accept newer requests", async () => {
    const old = await (await send()).json() as FriendStateDto; actor = "friend-b";
    expect((await request(`/me/friends/requests/${old.friendshipId}/respond`, "POST", { action: "DECLINE" })).status).toBe(200);
    actor = "friend-a"; expect((await send()).status).toBe(403);
    (ctx.services.clock as FixedClock).advance(FRIEND_REQUEST_COOLDOWN_MS + 1);
    const fresh = await (await send()).json() as FriendStateDto; expect(fresh.friendshipId).not.toBe(old.friendshipId);
    actor = "friend-b"; expect((await request(`/me/friends/requests/${old.friendshipId}/respond`, "POST", { action: "ACCEPT" })).status).toBe(404);
    actor = "friend-a"; expect((await request(`/me/friends/${fresh.friendshipId}`, "DELETE")).status).toBe(200); expect((await list("outgoing")).items).toEqual([]);
  });

  it("searches only chosen names and aliases, folds accents, and never exposes hidden account ids", async () => {
    expect((await search("alvaro")).items[0]).toMatchObject({ displayName: "Álvaro", target: { kind: "user", userId: "friend-b" } });
    for (const query of ["SecretName", "SecretSurname", "PrivateBiography", "PrivateStudentNumber", "example.test"]) expect((await search(query)).items).toEqual([]);
    const response = await request("/people/search?q=hormiga"); const body = await response.json() as Page<PersonSearchDto>; const hidden = body.items[0] as PersonSearchDto;
    expect(hidden).toMatchObject({ displayName: "Hormiga Curiosa", target: { kind: "alias", alias: "Hormiga Curiosa" }, avatarUrl: null, career: null });
    expect(JSON.stringify(body)).not.toContain("friend-hidden"); expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await request("/people/search?q=a")).status).toBe(400); expect((await request("/people/search?q=al&cursor=-1")).status).toBe(400);
  });

  it("allows alias friendships without deanonymizing a formerly hidden contact", async () => {
    const sent = await (await request("/me/friends/requests", "POST", { target: { kind: "alias", alias: "Hormiga Curiosa" } })).json() as FriendStateDto;
    actor = "friend-hidden"; await request(`/me/friends/requests/${sent.friendshipId}/respond`, "POST", { action: "ACCEPT" }); actor = "friend-a";
    ctx.db.update(schema.userProfiles).set({ identityMode: "FULL_NAME" }).where(eq(schema.userProfiles.userId, "friend-hidden")).run();
    const friends = await list(); expect(friends.items[0]?.person).toMatchObject({ displayName: "Hormiga Curiosa", profileHref: null, target: { kind: "alias" } });
    expect(JSON.stringify(friends)).not.toContain("friend-hidden"); expect(JSON.stringify(friends)).not.toContain("SecretName");
    expect(ctx.services.friends.list("friend-a", "friends", "0", "SecretName").items).toEqual([]);
    expect(ctx.services.friends.list("friend-a", "friends", "0", "Hormiga").items).toHaveLength(1);
    expect((await search("SecretName")).items).toEqual([]);
  });

  it("honors directory and request toggles; friendship does not enable private fields or direct messages", async () => {
    ctx.db.update(schema.userPrivacySettings).set({ showInPeopleSearch: false, allowFriendRequests: false, allowDirectMessages: false }).where(eq(schema.userPrivacySettings.userId, "friend-b")).run();
    expect((await search("alvaro")).items).toEqual([]); expect((await send()).status).toBe(403);
    ctx.db.update(schema.userPrivacySettings).set({ allowFriendRequests: true }).where(eq(schema.userPrivacySettings.userId, "friend-b")).run();
    const sent = await (await send()).json() as FriendStateDto; actor = "friend-b"; await request(`/me/friends/requests/${sent.friendshipId}/respond`, "POST", { action: "ACCEPT" }); actor = "friend-a";
    const profile = await (await request("/profiles/friend-b")).json(); expect(profile).toMatchObject({ allowsDirectMessages: false, studentNumber: null, instagram: null });
  });

  it("blocks in either direction atomically remove friendship and never resurrect it after unblock", async () => {
    const sent = await (await send()).json() as FriendStateDto; actor = "friend-b"; await request(`/me/friends/requests/${sent.friendshipId}/respond`, "POST", { action: "ACCEPT" });
    await ctx.services.blocks.block("friend-b", "friend-a"); actor = "friend-a";
    expect((await list()).items).toEqual([]); expect((await send()).status).toBe(404); expect((await search("alvaro")).items).toEqual([]);
    await ctx.services.blocks.unblock("friend-b", "friend-a"); expect((await list()).items).toEqual([]);
    await ctx.services.blocks.block("friend-a", "friend-b"); expect((await send()).status).toBe(404);
  });

  it("rejects anonymous/unverified actors, forged senders, self-requests and unsafe origins", async () => {
    actor = null; expect((await request("/me/friends")).status).toBe(401); expect((await send()).status).toBe(401);
    actor = "friend-unverified"; expect((await send()).status).toBe(401);
    actor = "friend-a"; expect((await send({ ...userTarget(), userId: "friend-c" } as ReturnType<typeof userTarget>)).status).toBe(400);
    expect((await send(userTarget("friend-a"))).status).toBe(400); expect((await request("/me/friends/requests", "POST", userTarget(), "https://evil.example.test")).status).toBe(403);
    expect((await send(userTarget("friend-unverified"))).status).toBe(404); expect(ctx.db.select().from(schema.friendships).all()).toHaveLength(0);
  });

  it("lets only the participants block an alias contact without receiving their private id", async () => {
    const sent = await (await request("/me/friends/requests", "POST", { target: { kind: "alias", alias: "Hormiga Curiosa" } })).json() as FriendStateDto;
    actor = "friend-c"; expect((await request(`/me/friends/${sent.friendshipId}/block`, "POST")).status).toBe(404);
    actor = "friend-a"; const response = await request(`/me/friends/${sent.friendshipId}/block`, "POST");
    expect(response.status).toBe(200); expect(JSON.stringify(await response.json())).not.toContain("friend-hidden");
    expect(ctx.db.select().from(schema.friendships).all()).toHaveLength(0);
    expect((await search("hormiga")).items).toEqual([]);
    actor = "friend-hidden"; expect((await send(userTarget("friend-a"))).status).toBe(404);
  });

  it("rechecks canonical suspension and verification rather than trusting a previously valid session", async () => {
    const sent = await (await send()).json() as FriendStateDto;
    ctx.db.insert(schema.userRestrictions).values({ userId: "friend-a", type: "SUSPENDED", reason: "Synthetic restriction" }).run();
    expect((await send()).status).toBe(403);
    actor = "friend-b"; expect((await request(`/me/friends/requests/${sent.friendshipId}/respond`, "POST", { action: "ACCEPT" })).status).toBe(404);
    expect((await list("incoming")).items).toEqual([]);
  });

  it("bounds search query count as the directory grows, paginates, and cascades account deletion", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `extra-friend-${i}`); await insertUsers(ctx.db, ids);
    for (const id of ids) { ctx.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id)).run(); ctx.db.insert(schema.userProfiles).values({ userId: id, identityMode: "FULL_NAME", firstName: "Shared Name" }).run(); }
    const { result: page, queries: used } = await countQueries(ctx.db, () => ctx.services.friends.search("friend-a", "Shared"));
    expect(used).toBeLessThanOrEqual(8); expect(page.items).toHaveLength(25); expect(page.nextCursor).toBe("25"); expect(ctx.services.friends.search("friend-a", "Shared", "25").items).toHaveLength(5);
    await send(); ctx.db.delete(schema.user).where(eq(schema.user.id, "friend-b")).run(); expect(ctx.db.select().from(schema.friendships).all()).toEqual([]);
  });
});
