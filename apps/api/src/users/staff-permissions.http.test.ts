import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import type { Auth } from "../auth/auth.instance.js";
import { createApp } from "../http/app.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { insertUsers } from "../test-utils.js";
import { env } from "../env.js";

describe("owner-only operations and shared room administration", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let app: ReturnType<typeof createApp>;
  let actor: string | null;
  let ownerEmail: string;
  const id = "00000000-0000-4000-8000-000000000001";
  beforeEach(async () => {
    ownerEmail = env.ownerEmail; env.ownerEmail = "owner@example.test";
    fixture = buildTestApp();
    await insertUsers(fixture.db, ["owner", "admin", "member", "viewer"]);
    fixture.db.update(schema.user).set({ emailVerified: true }).run();
    fixture.db.insert(schema.userRoles).values([{ userId: "owner", role: "ADMIN" }, { userId: "admin", role: "ADMIN" }]).run();
    actor = "admin";
    const auth = { api: { getSession: async () => actor ? { user: { id: actor, name: actor, email: `${actor}@example.test`, emailVerified: true } } : null } } as unknown as Auth;
    app = createApp({ services: fixture.services, auth });
  });
  afterEach(() => { env.ownerEmail = ownerEmail; });
  const call = (path: string, method = "GET", body?: unknown) => app.request(`/api/v1${path}`, {
    method, headers: baseHeaders({ "content-type": "application/json" }), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  it("denies ordinary admins every owner-only read and write before validation or mutation", async () => {
    const routes: [string, string][] = [
      ["GET", "/admin/announcements"], ["POST", "/admin/announcements"], ["PATCH", `/admin/announcements/${id}`], ["DELETE", `/admin/announcements/${id}`],
      ["GET", "/admin/rooms/principal/geofence"], ["POST", "/admin/rooms/principal/geofence/test"], ["PUT", "/admin/rooms/principal/geofence"],
      ["POST", "/admin/rooms/principal/chat/clear"],
      ["GET", "/admin/email-campaigns"], ["GET", "/admin/email-campaigns/config"], ["GET", "/admin/email-campaigns/recipients/count"],
      ["POST", "/admin/email-campaigns"], ["PATCH", `/admin/email-campaigns/${id}`], ["POST", `/admin/email-campaigns/${id}/send`],
      ["PUT", "/admin/users/member/admin"], ["DELETE", "/admin/users/member/admin"], ["PUT", "/admin/users/member/shield"], ["DELETE", "/admin/users/member/shield"],
      ["POST", "/admin/users/member/delete"], ["POST", "/admin/study-sessions"], ["GET", "/admin/verification/status"], ["POST", "/admin/verification/test"],
    ];
    for (const [method, path] of routes) {
      const res = await call(path, method, method === "GET" ? undefined : { isSuperAdmin: true });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    expect(fixture.db.select().from(schema.moderationActions).all()).toEqual([]);
    expect(fixture.db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, "member")).all()).toEqual([]);
    expect(fixture.db.select().from(schema.userShields).all()).toEqual([]);
    expect(fixture.db.select().from(schema.announcements).all()).toEqual([]);
    expect(fixture.db.select().from(schema.emailCampaigns).all()).toEqual([]);
  });

  it("keeps reports, suggestions, moderation, mass marking and undo available to both kinds of admin", async () => {
    fixture.db.insert(schema.userReports).values({ id, reporterId: "member", reportedUserId: "viewer", reason: "OTHER", context: "PROFILE" }).run();
    fixture.db.insert(schema.feedback).values({ id, userId: "member", category: "SUGGESTION", message: "Synthetic suggestion" }).run();
    for (const user of ["admin", "owner"]) {
      actor = user;
      expect((await call("/admin/reports")).status).toBe(200);
      expect((await call(`/admin/reports/${id}`)).status).toBe(200);
      for (const status of ["UNDER_REVIEW", "DISMISSED", "RESOLVED", "OPEN"]) expect((await call(`/admin/reports/${id}`, "PATCH", { status })).status).toBe(200);
      expect((await call("/admin/feedback")).status).toBe(200);
      for (const status of ["RESOLVED", "OPEN"]) expect((await call(`/admin/feedback/${id}`, "PATCH", { status })).status).toBe(200);
      expect((await call("/admin/users/viewer/actions", "POST", { type: "WARN", reason: "Synthetic warning" })).status).toBe(201);
      expect((await call("/admin/rooms/principal/mark-all-occupied", "POST", { minutes: 60 })).status).toBe(201);
      expect((await call("/admin/rooms/principal/mark-all-occupied/undo", "POST", {})).status).toBe(201);
    }
  });

  it("allows owner reads and announcement management while keeping public announcements public", async () => {
    actor = "owner";
    for (const path of ["/admin/announcements", "/admin/rooms/principal/geofence", "/admin/email-campaigns", "/admin/email-campaigns/config", "/admin/email-campaigns/recipients/count", "/admin/verification/status"]) expect((await call(path)).status, path).toBe(200);
    const created = await call("/admin/announcements", "POST", { title: "Aviso de prueba", body: "Texto sintético", active: true });
    expect(created.status).toBe(201);
    const announcement = await created.json() as { id: string };
    expect((await call(`/admin/announcements/${announcement.id}`, "PATCH", { title: "Aviso corregido" })).status).toBe(200);
    actor = null;
    expect((await call("/rooms/principal/announcements")).status).toBe(200);
    expect((await call("/admin/announcements")).status).toBe(401);
    actor = "owner";
    expect((await call(`/admin/announcements/${announcement.id}`, "DELETE")).status).toBe(200);
  });

  it("only clears the room chat for the canonical owner", async () => {
    await fixture.services.chat.createMessage("member", "principal", "Mensaje sintético");
    expect((await call("/admin/rooms/principal/chat/clear", "POST", {})).status).toBe(403);
    expect(fixture.db.select().from(schema.chatMessages).all()).toHaveLength(1);
    actor = "owner";
    const cleared = await call("/admin/rooms/principal/chat/clear", "POST", {});
    expect(cleared.status).toBe(201);
    expect(await cleared.json()).toEqual({ count: 1 });
    expect(fixture.db.select().from(schema.chatMessages).all()).toEqual([]);
  });

  it("also hides geofence and campaign metadata in audit responses to ordinary admins", async () => {
    fixture.db.insert(schema.moderationActions).values([
      { actorId: "owner", action: "ROOM_GEOFENCE_UPDATED", metadata: { old: { latitude: 12.5, longitude: 24.5 }, next: { latitude: 12.6, longitude: 24.6 } } },
      { actorId: "owner", action: "EMAIL_CAMPAIGN_SENT", metadata: { campaignId: "private-campaign", recipientCount: 13 } },
    ]).run();
    const admin = await call("/admin/audit?ownerMetadata=true");
    expect(admin.headers.get("cache-control")).toBe("private, no-store");
    const data = await admin.json() as { items: { metadata: unknown }[] };
    expect(data.items).toHaveLength(2);
    expect(data.items.every(item => item.metadata === null)).toBe(true);
    actor = "owner";
    const full = await (await call("/admin/audit")).json() as { items: { action: string; metadata: unknown }[] };
    expect(full.items.find(item => item.action === "ROOM_GEOFENCE_UPDATED")?.metadata).toMatchObject({ next: { latitude: 12.6 } });
    expect(full.items.find(item => item.action === "EMAIL_CAMPAIGN_SENT")?.metadata).toMatchObject({ recipientCount: 13 });
  });
});
