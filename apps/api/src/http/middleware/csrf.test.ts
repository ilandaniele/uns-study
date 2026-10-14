import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { csrfMiddleware, isCsrfRejected } from "./csrf.js";

const webOrigins = ["http://localhost:3000", "https://sala-de-estudio.example"];

describe("isCsrfRejected", () => {
  it("allows GET/HEAD/OPTIONS regardless of origin", () => {
    expect(isCsrfRejected({ method: "GET", origin: "https://evil.test" }, webOrigins)).toBe(false);
  });

  it("allows a state-changing request with no Origin and no Sec-Fetch-Site (curl / server-to-server)", () => {
    expect(isCsrfRejected({ method: "POST" }, webOrigins)).toBe(false);
  });

  it("rejects a cookie-bearing state-changing request with no Origin and no Sec-Fetch-Site", () => {
    expect(isCsrfRejected({ method: "POST", hasCookie: true }, webOrigins)).toBe(true);
  });

  it("allows a cookie-bearing request from a trusted Origin or same-origin fetch", () => {
    expect(isCsrfRejected({ method: "POST", hasCookie: true, origin: "http://localhost:3000" }, webOrigins)).toBe(false);
    expect(isCsrfRejected({ method: "POST", hasCookie: true, secFetchSite: "same-origin" }, webOrigins)).toBe(false);
  });

  it("allows a state-changing request from a trusted Origin", () => {
    expect(isCsrfRejected({ method: "POST", origin: "http://localhost:3000" }, webOrigins)).toBe(false);
  });

  it("rejects a state-changing request with an untrusted Origin", () => {
    expect(isCsrfRejected({ method: "POST", origin: "https://evil.test" }, webOrigins)).toBe(true);
  });

  it("rejects a state-changing request with Sec-Fetch-Site: cross-site even without Origin", () => {
    expect(isCsrfRejected({ method: "DELETE", secFetchSite: "cross-site" }, webOrigins)).toBe(true);
  });

  it("rejects Sec-Fetch-Site: cross-site even when Origin is trusted", () => {
    expect(
      isCsrfRejected({ method: "PATCH", origin: "http://localhost:3000", secFetchSite: "cross-site" }, webOrigins),
    ).toBe(true);
  });

  it("allows Sec-Fetch-Site: same-origin", () => {
    expect(isCsrfRejected({ method: "PUT", secFetchSite: "same-origin" }, webOrigins)).toBe(false);
  });
});

describe("csrfMiddleware", () => {
  const app = new Hono();
  app.use("*", csrfMiddleware(webOrigins));
  app.all("*", (c) => c.json({ ok: true }));

  it("answers 403 FORBIDDEN with the API error shape to an untrusted origin on /api/v1", async () => {
    const res = await app.request("/api/v1/rooms", { method: "POST", headers: { origin: "https://evil.test" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Origen no permitido." } });
  });

  it("lets trusted origins through and ignores paths outside /api/v1", async () => {
    expect((await app.request("/api/v1/rooms", { method: "POST", headers: { origin: "http://localhost:3000" } })).status).toBe(200);
    expect((await app.request("/api/auth/sign-in", { method: "POST", headers: { origin: "https://evil.test" } })).status).toBe(200);
  });
});
