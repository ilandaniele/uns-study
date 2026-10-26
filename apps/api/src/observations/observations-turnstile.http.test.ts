import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@sala/database";
import { baseHeaders, buildTestApp } from "../http/test-app.js";
import { getRoom, getSeats } from "../test-utils.js";
import { ApiErrors } from "../common/api-error.js";

afterEach(() => vi.restoreAllMocks());

describe("observation challenge continuation", () => {
  it("rejects a missing/bad token, then persists the same observation with a fresh valid token", async () => {
    const { app, db, services } = buildTestApp();
    const signup = await app.request("/api/auth/sign-up/email", {
      method: "POST", headers: baseHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email: "captcha@example.invalid", password: "synthetic-test-password", name: "Captcha fixture" }),
    });
    expect(signup.status).toBe(200);
    const cookie = signup.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const room = await getRoom(db);
    const [seat] = await getSeats(db);
    const verify = vi.spyOn(services.turnstile, "verify").mockImplementation(async (token) => token === "fresh-valid");
    vi.spyOn(services.abusePolicy, "requiresChallenge").mockResolvedValue(true);
    const send = (turnstileToken?: string, outside = false) => app.request("/api/v1/observations", {
      method: "POST", headers: baseHeaders({ cookie, "content-type": "application/json" }),
      body: JSON.stringify({ roomId: room.id, seatId: seat!.id, status: "OCCUPIED", turnstileToken,
        location: { latitude: outside ? 0 : room.latitude, longitude: outside ? 0 : room.longitude, accuracy: 10, capturedAt: new Date().toISOString() } }),
    });
    for (const token of [undefined, "expired-or-used"]) {
      const res = await send(token);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "TURNSTILE_REQUIRED" } });
      expect(await db.select().from(schema.seatObservations)).toHaveLength(0);
    }
    const ok = await send("fresh-valid");
    expect(ok.status).toBe(201);
    expect(await db.select().from(schema.seatObservations).where(eq(schema.seatObservations.seatId, seat!.id))).toHaveLength(1);
    expect(verify).toHaveBeenCalledTimes(3);
    // A rate rejection precedes token validation: it cannot consume a token and strand the retry.
    vi.spyOn(services.antiAbuse, "enforceRateLimit").mockRejectedValueOnce(ApiErrors.rateLimited());
    const limited = await send("fresh-valid");
    expect(limited.status).toBe(429);
    expect(verify).toHaveBeenCalledTimes(3);
    // Solving a CAPTCHA must not replace presence validation.
    const outside = await send("fresh-valid", true);
    expect(outside.status).toBe(403);
    expect(await outside.json()).toMatchObject({ error: { code: "PRESENCE_REJECTED" } });
    expect(verify).toHaveBeenCalledTimes(3);
  });
});
