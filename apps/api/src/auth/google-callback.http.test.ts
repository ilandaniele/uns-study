import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { env } from "../env.js";
import { buildTestApp } from "../http/test-app.js";

const ORIGIN = "https://oauth.example.test";
const ADDRESS = "google-owner@example.test";

/** Real Better Auth + Hono + SQLite; only Google's external token/profile exchange is simulated. */
describe("Google return after choosing an account", () => {
  let fixture: ReturnType<typeof buildTestApp>, restore: typeof env;
  let provider: (Awaited<ReturnType<typeof buildTestApp>["auth"]["$context"]>["socialProviders"])[number];
  let tokenExchange: ReturnType<typeof vi.spyOn>, userInfo: ReturnType<typeof vi.spyOn>;
  let sequence = 0;
  const cookieOf = (response: Response) => response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
  const headers = () => ({ origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": `203.0.113.${sequence}` });
  const profile = (verified = true) => ({ user: { name: "Synthetic Google owner", email: ADDRESS, emailVerified: verified }, data: { sub: "synthetic-google-subject", name: "Synthetic Google owner", email: ADDRESS, email_verified: verified } });

  beforeEach(async () => {
    sequence++; restore = { ...env };
    Object.assign(env, { isProduction: true, betterAuthUrl: ORIGIN, publicWebUrl: ORIGIN, webOrigins: [ORIGIN],
      betterAuthSecret: "test-only-google-callback-secret-123456789", googleClientId: "synthetic-google-client", googleClientSecret: "test-only-synthetic-client", resendApiKey: "", emailFrom: "" });
    fixture = buildTestApp();
    const context = await fixture.auth.$context;
    // Better Auth defaults origin/CSRF checks off under NODE_ENV=test. Exercise deployed rules.
    context.skipOriginCheck = false; context.skipCSRFCheck = false;
    vi.spyOn(context.logger, "error").mockImplementation(() => undefined);
    provider = context.socialProviders.find(p => p.id === "google")!;
    tokenExchange = vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({ accessToken: "synthetic-google-access", scopes: ["openid", "email", "profile"] });
    userInfo = vi.spyOn(provider, "getUserInfo").mockResolvedValue(profile());
  });
  afterEach(() => { Object.assign(env, restore); vi.restoreAllMocks(); vi.useRealTimers(); });

  async function start(includeErrorUrl = true) {
    const response = await fixture.app.request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: headers(), body: JSON.stringify({ provider: "google", callbackURL: `${ORIGIN}/personas?tab=friends`, disableRedirect: true,
      ...(includeErrorUrl ? { errorCallbackURL: `${ORIGIN}/login?oauth=google&next=%2Fpersonas` } : {}) }) });
    expect(response.status).toBe(200);
    const authorize = new URL((await response.json() as { url: string }).url);
    return { state: authorize.searchParams.get("state")!, cookie: cookieOf(response) };
  }
  async function callback(flow: Awaited<ReturnType<typeof start>>, options: { cookie?: string; error?: string } = {}) {
    const params = new URLSearchParams({ state: flow.state, ...(options.error ? { error: options.error } : { code: "synthetic-approved-code" }) });
    return fixture.app.request(`${ORIGIN}/api/auth/callback/google?${params}`, { headers: { ...headers(), cookie: options.cookie ?? flow.cookie } });
  }
  function legacy(verified: boolean, linked = false) {
    fixture.db.insert(schema.user).values({ id: "existing-local", name: "Existing account", email: ADDRESS, emailVerified: verified }).run();
    fixture.db.insert(schema.account).values({ id: "existing-password", userId: "existing-local", providerId: "credential", accountId: "existing-local", password: "synthetic-preserved-credential" }).run();
    if (linked) fixture.db.insert(schema.account).values({ id: "existing-google", userId: "existing-local", providerId: "google", accountId: "synthetic-google-subject" }).run();
  }

  it("creates a verified new account, a secure first-party session and usable REST access", async () => {
    const response = await callback(await start());
    expect(response.status).toBe(302); expect(response.headers.get("location")).toBe(`${ORIGIN}/personas?tab=friends`);
    const user = fixture.db.select().from(schema.user).get(); expect(user).toMatchObject({ email: ADDRESS, emailVerified: true });
    expect(fixture.db.select().from(schema.session).all()).toHaveLength(1);
    expect(response.headers.getSetCookie().some(cookie => cookie.includes("session_token=") && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie))).toBe(true);
    const me = await fixture.app.request(`${ORIGIN}/api/v1/me`, { headers: { ...headers(), cookie: cookieOf(response) } });
    expect(await me.json()).toMatchObject({ user: { id: user!.id, emailVerified: true } });
    expect(tokenExchange).toHaveBeenCalledWith(expect.objectContaining({ codeVerifier: expect.any(String), redirectURI: `${ORIGIN}/api/auth/callback/google` }));
    expect(userInfo).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "synthetic-google-access" }));
  });

  it("links a verified email account without duplication, losing its password or changing its garden", async () => {
    legacy(true); fixture.db.insert(schema.userGardens).values({ userId: "existing-local", bonusSeeds: 37, updatedAt: new Date() }).run();
    const response = await callback(await start()); expect(response.headers.get("location")).toBe(`${ORIGIN}/personas?tab=friends`);
    expect(fixture.db.select().from(schema.user).all()).toHaveLength(1); expect(fixture.db.select().from(schema.session).get()?.userId).toBe("existing-local");
    expect(fixture.db.select().from(schema.account).where(eq(schema.account.id, "existing-password")).get()?.password).toBe("synthetic-preserved-credential");
    expect(fixture.db.select().from(schema.account).where(eq(schema.account.providerId, "google")).get()?.userId).toBe("existing-local");
    expect(fixture.db.select().from(schema.userGardens).get()?.bonusSeeds).toBe(37);
  });

  it("signs in an already linked account without duplicate users or provider bindings", async () => {
    legacy(true, true); expect((await callback(await start())).status).toBe(302);
    expect(fixture.db.select().from(schema.user).all()).toHaveLength(1); expect(fixture.db.select().from(schema.account).all()).toHaveLength(2);
    expect(fixture.db.select().from(schema.session).get()?.userId).toBe("existing-local");
  });

  it("does not implicitly link an unverified legacy email or leave an authenticated session", async () => {
    legacy(false); const response = await callback(await start());
    const location = new URL(response.headers.get("location")!); expect(location.pathname).toBe("/login"); expect(location.searchParams.get("error")).toBe("account_not_linked");
    expect(fixture.db.select().from(schema.user).get()?.emailVerified).toBe(false);
    expect(fixture.db.select().from(schema.session).all()).toEqual([]); expect(fixture.db.select().from(schema.account).all()).toHaveLength(1);
  });

  it("refuses a missing/wrong browser state cookie before consulting Google's token endpoint", async () => {
    const first = await start(), second = await start();
    for (const cookie of ["", second.cookie]) {
      const response = await callback(first, { cookie });
      const destination = new URL(response.headers.get("location")!);
      expect(destination.pathname).toBe("/login"); expect(destination.searchParams.get("oauth")).toBe("google");
      expect(destination.searchParams.has("error")).toBe(true);
    }
    expect(tokenExchange).not.toHaveBeenCalled(); expect(fixture.db.select().from(schema.session).all()).toEqual([]);
  });

  it("handles expired and replayed callbacks without creating extra sessions", async () => {
    const first = await start(); await callback(first); await callback(first);
    expect(fixture.db.select().from(schema.session).all()).toHaveLength(1);
    const expired = await start(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 601_000);
    const response = await callback(expired); const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login"); expect(location.searchParams.has("error")).toBe(true); expect(fixture.db.select().from(schema.session).all()).toHaveLength(1);
  });

  it("returns cancellation and token-exchange failures to the login screen", async () => {
    let response = await callback(await start(), { error: "access_denied" });
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
    tokenExchange.mockRejectedValue(new Error("Synthetic provider failure")); response = await callback(await start());
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("invalid_code"); expect(fixture.db.select().from(schema.session).all()).toEqual([]);
  });

  it("keeps banned accounts from creating sessions", async () => {
    legacy(true, true); fixture.db.insert(schema.userRestrictions).values({ userId: "existing-local", type: "BANNED", reason: "Synthetic ban" }).run();
    const response = await callback(await start()); expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("ACCOUNT_BANNED");
    expect(fixture.db.select().from(schema.session).all()).toEqual([]);
  });

  it("refuses a session when Google does not attest mailbox ownership", async () => {
    userInfo.mockResolvedValue(profile(false)); const response = await callback(await start());
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("EMAIL_NOT_VERIFIED");
    expect(fixture.db.select().from(schema.session).all()).toEqual([]);
    expect(fixture.db.select().from(schema.user).get()?.emailVerified).not.toBe(true);
  });

  it("rejects an external error callback and supplies a safe fallback for older open tabs", async () => {
    const bad = await fixture.app.request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: headers(), body: JSON.stringify({ provider: "google", callbackURL: `${ORIGIN}/`, errorCallbackURL: "https://evil.example.test/" }) });
    expect(bad.status).toBe(403);
    const flow = await start(false); const response = await callback(flow, { cookie: "" });
    const destination = new URL(response.headers.get("location")!); expect(destination.origin).toBe(ORIGIN); expect(destination.pathname).toBe("/login");
  });
});
