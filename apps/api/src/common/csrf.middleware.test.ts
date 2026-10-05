import { describe, expect, it } from "vitest";
import { isCsrfRejected } from "./csrf.middleware.js";

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
