import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { AdminProfileDto, PublicProfileDto } from "@sala/contracts";
import { env } from "../env.js";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom, getSeats, insertUsers } from "../test-utils.js";

describe("private administrative profile", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let actor: string | null;
  const privateFields = { firstName: "Nombre privado", lastName: "Apellido privado", nickname: "Apodo privado", customName: "Nombre elegido privado", career: "Carrera privada", currentSubject: "Materia privada", bio: "Bio privada", instagram: "perfil_privado", studentNumber: "LEG-PRIVADO" };

  beforeEach(async () => {
    fixture = buildTestApp();
    await insertUsers(fixture.db, ["admin", "staff", "mod", "plain", "target", "empty"]);
    await fixture.db.update(schema.user).set({ emailVerified: true });
    await fixture.db.update(schema.user).set({email:env.ownerEmail}).where(eq(schema.user.id,"admin"));
    await fixture.db.insert(schema.userRoles).values([{ userId: "admin", role: "ADMIN" }, { userId: "staff", role: "ADMIN" }, { userId: "mod", role: "MODERATOR" }]);
    await fixture.db.insert(schema.userProfiles).values({ userId: "target", ...privateFields, identityMode: "HIDDEN", alias: "Tortuga de prueba", aliasAnimal: "tortuga", avatarUrl: "/api/v1/avatars/target?v=test" });
    await fixture.db.insert(schema.userPrivacySettings).values({ userId: "target" });
    await fixture.db.insert(schema.account).values({ id: "private-account", userId: "target", accountId: "target", providerId: "credential", password: "credential-must-never-leak", accessToken: "oauth-must-never-leak" });
    await fixture.db.insert(schema.session).values({ id: "private-session", userId: "target", token: "session-must-never-leak", expiresAt: new Date(Date.now() + 60000), ipAddress: "192.0.2.77" });
    actor = "admin";
    // Deliberately claims verification even in the stale/unverified canonical-user test below.
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, name: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });

  const headers = () => baseHeaders();
  const read = (id = "target") => app.request(`/api/v1/admin/users/${id}/profile`, { headers: headers() });

  it("returns all stored profile fields only to the superadmin, with an audit and no credential data", async () => {
    const room = await getRoom(fixture.db); const [seat] = await getSeats(fixture.db);
    await fixture.db.insert(schema.checkIns).values({ userId: "target", roomId: room.id, seatId: seat!.id, showIdentity: false, expiresAt: new Date(Date.now() + 60000), locationAccuracyM: 12.34 });
    await fixture.db.insert(schema.studyStatus).values({ userId: "target", roomId: room.id, active: true, subject: "Estudio privado", message: "Mensaje de estudio privado", lookingForGroup: true });
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    const body = await response.json() as AdminProfileDto;
    expect(body.account).toMatchObject({ name: "target", email: "target@example.test", emailVerified: true });
    expect(body.profile).toMatchObject({ ...privateFields, identityMode: "HIDDEN", alias: "Tortuga de prueba", aliasAnimal: "tortuga", avatarUrl: "/api/v1/admin/users/target/profile/avatar" });
    expect(body.privacy).toMatchObject({ showAvatar: false, showCareer: false, showInstagram: false, showStudentNumber: false });
    expect(body.activeCheckIn).toMatchObject({ seatCode: seat!.code, roomName: room.name, showIdentity: false });
    expect(body.studyStatus).toMatchObject({ subject: "Estudio privado", message: "Mensaje de estudio privado", lookingForGroup: true });
    const serialized = JSON.stringify(body);
    for (const secret of ["credential-must-never-leak", "oauth-must-never-leak", "session-must-never-leak", "192.0.2.77", "locationAccuracyM", "latitude", "longitude"]) expect(serialized).not.toContain(secret);
    const [audit] = await fixture.db.select().from(schema.moderationActions);
    expect(audit).toMatchObject({ actorId: "admin", targetUserId: "target", action: "ADMIN_PROFILE_VIEWED", metadata: {} });
    expect(JSON.stringify(audit)).not.toContain(privateFields.studentNumber);
  });

  it("keeps the public response filtered even when its viewer is an admin", async () => {
    for (const viewer of ["plain", "mod", "admin"]) {
      actor = viewer;
      const response = await app.request("/api/v1/profiles/target", { headers: headers() });
      expect(response.status).toBe(200);
      const body = await response.json() as PublicProfileDto;
      expect(body).toMatchObject({ displayName: "Tortuga de prueba", avatarUrl: null, career: null, currentSubject: null, bio: null, instagram: null, studentNumber: null });
      expect(body).not.toHaveProperty("email");
      expect(body).not.toHaveProperty("account");
    }
    expect(await fixture.db.select().from(schema.moderationActions)).toEqual([]);
  });

  it("rejects anonymous callers, ordinary users and moderators, including after an admin read", async () => {
    expect((await read()).status).toBe(200);
    actor = null; expect((await read()).status).toBe(401);
    for (const viewer of ["plain", "mod", "staff"]) {
      actor = viewer;
      const response = await app.request("/api/v1/admin/users/target/profile?admin=true", { headers: headers() });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(privateFields.studentNumber);
    }
    expect(await fixture.db.select().from(schema.moderationActions)).toHaveLength(1);
  });

  it("rejects unverified or restricted admins, and respects role revocation on the next request", async () => {
    await fixture.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, "admin"));
    expect((await read()).status).toBe(403);
    await fixture.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, "admin"));
    await fixture.db.insert(schema.userRestrictions).values({ userId: "admin", type: "BANNED", reason: "Test only" });
    expect((await read()).status).toBe(403);
    await fixture.db.delete(schema.userRestrictions);
    expect((await read()).status).toBe(200);
    await fixture.db.delete(schema.userRoles).where(eq(schema.userRoles.userId, "admin"));
    expect((await read()).status).toBe(403);
  });

  it("blocks staff access to the private user directory as well as full profiles",async()=>{
    actor="staff";
    for(const path of ["/api/v1/admin/users?q=target@example.test","/api/v1/admin/users/target","/api/v1/admin/users/target/profile/avatar"]){
      const response=await app.request(path,{headers:headers()});expect(response.status).toBe(403);expect(await response.text()).not.toContain("target@example.test");
    }
  });

  it("keeps suggestions reviewable by staff without leaking the contact address or hidden account name",async()=>{
    await fixture.services.feedback.create({userId:"target",accountEmail:"target@example.test",accountEmailVerified:true,accountName:"Private account name",category:"SUGGESTION",message:"Más enchufes de prueba",ipHash:"synthetic",email:"private-contact@example.test"});
    const ownerResponse=await app.request("/api/v1/admin/feedback",{headers:headers()});
    expect(ownerResponse.status).toBe(200);expect(await ownerResponse.text()).toContain("private-contact@example.test");
    actor="staff";
    const response=await app.request("/api/v1/admin/feedback",{headers:headers()});
    expect(response.status).toBe(200);
    const body=await response.json() as {items:{contactEmail:string|null;sender:{name:string}}[]};
    expect(body.items[0]).toMatchObject({contactEmail:null,sender:{name:"Tortuga de prueba"}});
    expect(JSON.stringify(body)).not.toContain("private-contact@example.test");
  });

  it("allows an administrative review despite a public block without changing the block", async () => {
    await fixture.db.insert(schema.userBlocks).values({ blockerId: "target", blockedId: "admin" });
    expect((await app.request("/api/v1/profiles/target", { headers: headers() })).status).toBe(404);
    expect((await read()).status).toBe(200);
    expect(await fixture.db.select().from(schema.userBlocks)).toHaveLength(1);
  });

  it("does not create missing profile/privacy rows and does not report expired check-ins as current", async () => {
    const room = await getRoom(fixture.db); const [seat] = await getSeats(fixture.db);
    await fixture.db.insert(schema.checkIns).values({ userId: "empty", roomId: room.id, seatId: seat!.id, expiresAt: new Date(Date.now() - 60000) });
    const body = await (await read("empty")).json() as AdminProfileDto;
    expect(body).toMatchObject({ profile: null, privacy: null, activeCheckIn: null });
    expect(await fixture.db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, "empty"))).toEqual([]);
    expect(await fixture.db.select().from(schema.userPrivacySettings).where(eq(schema.userPrivacySettings.userId, "empty"))).toEqual([]);
    expect((await read("missing")).status).toBe(404);
  });

  it("serves hidden photo bytes only through the audited admin route with no-store caching", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await fixture.db.insert(schema.userAvatars).values({ userId: "target", mimeType: "image/jpeg", bytes, sha256: "test-only-hash" });
    const url = "/api/v1/admin/users/target/profile/avatar";
    const response = await app.request(url, { headers: headers() });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect((await app.request("/api/v1/avatars/target", { headers: headers() })).status).toBe(404);
    for (const viewer of ["plain", "mod", "staff"]) { actor = viewer; expect((await app.request(url, { headers: headers() })).status).toBe(403); }
    actor = null; expect((await app.request(url, { headers: headers() })).status).toBe(401);
    const audit = await fixture.db.select().from(schema.moderationActions);
    expect(audit).toMatchObject([{ actorId: "admin", targetUserId: "target", action: "ADMIN_PROFILE_PHOTO_VIEWED", metadata: {} }]);
  });
});
