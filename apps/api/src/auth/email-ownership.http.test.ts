import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { ResendClient, type ResendMessage } from "../email/resend.client.js";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { buildAuth } from "./auth.instance.js";
import { dbSessionLookup } from "../realtime/ws-server.js";

describe("deployed email ownership", () => {
  let fixture: ReturnType<typeof buildTestApp>;
  let messages: ResendMessage[];
  let restore: typeof env;
  let sequence = 0;
  let address: string;
  let ip: string;
  beforeEach(() => {
    sequence++;
    address = `owner-${sequence}@example.test`; ip = `203.0.113.${sequence}`;
    restore = { ...env }; messages = [];
    Object.assign(env, { isProduction: true, betterAuthSecret: "test-only-email-ownership-secret-123456789", resendApiKey: "test-not-a-key", emailFrom: "Sala <test@example.test>" });
    vi.spyOn(ResendClient.prototype, "sendBatch").mockImplementation(async msgs => { messages.push(...msgs); return ["test-mail"]; });
    fixture = buildTestApp();
  });
  afterEach(() => { Object.assign(env, restore); vi.restoreAllMocks(); vi.useRealTimers(); });
  const cookieOf = (r: Response) => r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  function post(path: string, body: unknown, cookie?: string) {
    return fixture.app.request(`/api/auth${path}`, { method: "POST", headers: baseHeaders({ "cf-connecting-ip": ip, "content-type": "application/json", ...(cookie ? { cookie } : {}) }), body: JSON.stringify(body) });
  }
  async function send(email = address) {
    const r = await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    expect(r.status).toBe(200);
    return messages.at(-1)!.text.match(/\b\d{6}\b/)![0];
  }
  async function redeem(code: string, email = address) { return post("/sign-in/email-otp", { email, otp: code, name: "Dueña" }); }
  async function legacy(verified = false) {
    env.isProduction = false;
    let response: Response;
    try { response = await buildAuth(fixture.db).api.signUpEmail({ body: { email: address, password: "unproven-password-123", name: "Anterior" }, headers: new Headers(baseHeaders()), asResponse: true }); }
    finally { env.isProduction = true; }
    expect(response.status).toBe(200);
    const { user } = await response.json() as { user: { id: string } };
    if (verified) await fixture.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, user.id));
    return { id: user.id, cookie: cookieOf(response) };
  }

  it("does not create a user or session until the mailbox code is confirmed; stores only a hash", async () => {
    const code = await send();
    expect(await fixture.db.select().from(schema.user)).toHaveLength(0);
    const [verification] = await fixture.db.select().from(schema.verification);
    expect(verification!.value).not.toContain(code);
    expect(verification!.expiresAt.getTime() - Date.now()).toBeGreaterThan(590_000);
    const r = await redeem(code);
    expect(r.status).toBe(200);
    const body = await r.json() as { user: { emailVerified: boolean } };
    expect(body.user.emailVerified).toBe(true);
    const me = await fixture.app.request("/api/v1/me", { headers: baseHeaders({ cookie: cookieOf(r) }) });
    expect(await me.json()).toMatchObject({ user: { email: address } });
    expect((await fixture.app.request("/api/v1/realtime/token", { headers: baseHeaders({ cookie: cookieOf(r) }) })).status).toBe(200);
    expect((await redeem(code)).status).toBe(400);
  });

  it("rejects direct password signup and alternative verification endpoints", async () => {
    expect((await post("/sign-up/email", { email: address, name: "Fake", password: "fake-password-123" })).status).toBe(400);
    expect(await fixture.db.select().from(schema.user)).toHaveLength(0);
    for (const path of ["/email-otp/verify-email", "/send-verification-email", "/email-otp/check-verification-otp", "/email-otp/reset-password"]) {
      expect((await post(path, { email: address, otp: "123456" })).status, path).toBe(403);
    }
    expect((await fixture.app.request("/api/auth/verify-email?token=old-token", { headers: baseHeaders() })).status).toBe(403);
    expect((await post("/email-otp/send-verification-otp", { email: "different@example.test", type: "email-verification" })).status).toBe(403);
    expect(messages).toHaveLength(0);
  });

  it("expires codes and refuses a code for a different email", async () => {
    const code = await send();
    expect((await redeem(code, "other@example.test")).status).toBe(400);
    await fixture.db.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await redeem(code)).status).toBe(400);
    expect(await fixture.db.select().from(schema.user)).toHaveLength(0);
  });

  it("locks a code after five wrong attempts", async () => {
    const code = await send();
    const wrong = code === "000000" ? "999999" : "000000";
    for (let i = 0; i < 5; i++) expect((await redeem(wrong)).status).toBe(400);
    const locked = await redeem(code);
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(await fixture.db.select().from(schema.session)).toHaveLength(0);
  });

  it("enforces resend cooldown, rotates a code and invalidates the previous one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const old = await send();
    expect((await post("/email-otp/send-verification-otp", { email: address.toUpperCase(), type: "sign-in" })).status).toBe(429);
    // The test app has a fixed domain clock: this test now isolates Better Auth's rotation.
    vi.spyOn(fixture.services.rateLimit, "check").mockResolvedValue({ allowed: true, remaining: 10 });
    vi.setSystemTime(Date.now() + 61_000);
    const fresh = await send();
    if (fresh !== old) expect((await redeem(old)).status).toBe(400);
    expect((await redeem(fresh)).status).toBe(200);
  });

  it("blocks old unverified sessions in REST, staff endpoints and realtime session lookups", async () => {
    const old = await legacy();
    const headers = baseHeaders({ cookie: old.cookie });
    expect(await (await fixture.app.request("/api/v1/me", { headers })).json()).toMatchObject({ user: null });
    for (const path of ["/api/v1/profiles/me", "/api/v1/realtime/token", "/api/v1/admin/users"]) expect((await fixture.app.request(path, { headers })).status).toBe(401);
    const [session] = await fixture.db.select().from(schema.session);
    const lookup = dbSessionLookup(fixture.db);
    expect(await lookup.isActive({ userId: old.id, sessionId: session!.id })).toBe(false);
    expect(await lookup.live([old.id])).toEqual([]);
  });

  it("proof recovers a legacy account, revokes all prior sessions and removes unproven credentials", async () => {
    const old = await legacy();
    expect((await post("/sign-in/email", { email: address, password: "unproven-password-123" })).status).toBe(403);
    const oldSessions = await fixture.db.select().from(schema.session);
    const code = await send();
    const response = await redeem(code);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: old.id, emailVerified: true } });
    expect(await fixture.db.select().from(schema.account)).toEqual([]);
    const active = await fixture.db.select().from(schema.session);
    expect(active).toHaveLength(1);
    expect(oldSessions.map(s => s.id)).not.toContain(active[0]!.id);
    expect((await post("/sign-in/email", { email: address, password: "unproven-password-123" })).status).toBe(401);
  });

  it("keeps verified users' password login working", async () => {
    await legacy(true);
    expect((await post("/sign-in/email", { email: address, password: "unproven-password-123" })).status).toBe(200);
  });

  it("fails closed when email delivery is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(ResendClient.prototype.sendBatch).mockRejectedValue(new Error("must-not-be-logged recipient or provider details"));
    const failed = await post("/email-otp/send-verification-otp", { email: address, type: "sign-in" });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("must-not-be-logged");
    expect(await fixture.db.select().from(schema.session)).toHaveLength(0);
    env.resendApiKey = "";
    fixture = buildTestApp();
    address = "unavailable@example.test";
    expect((await post("/email-otp/send-verification-otp", { email: address, type: "sign-in" })).status).toBe(503);
    expect(await fixture.db.select().from(schema.user)).toHaveLength(0);
  });
});
