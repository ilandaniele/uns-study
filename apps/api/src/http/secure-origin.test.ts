import { describe, expect, it } from "vitest";
import { secureOriginRedirect } from "./secure-origin.js";

describe("secure deployment origin", () => {
  it.each(["saladeestudio.com.ar", "dev.saladeestudio.com.ar"])("upgrades HTTP on %s without dropping callback state or method", host => {
    const request = new Request(`http://${host}/api/auth/callback/google?state=synthetic&code=synthetic`, { method: "POST", body: "synthetic" });
    const response = secureOriginRedirect(request);
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(`https://${host}/api/auth/callback/google?state=synthetic&code=synthetic`);
    expect(response?.headers.get("set-cookie")).toBeNull();
  });

  it("canonicalizes the legacy host in one hop", () => {
    expect(secureOriginRedirect(new Request("http://www.saladeestudio.com.ar/api/v1/health"))?.headers.get("location")).toBe("https://saladeestudio.com.ar/api/v1/health");
  });

  it.each(["https://saladeestudio.com.ar", "https://dev.saladeestudio.com.ar", "http://localhost:4000", "http://127.0.0.1:4000", "http://saladeestudio.com.ar.evil.test"])("does not redirect %s", origin => {
    expect(secureOriginRedirect(new Request(`${origin}/api/v1/health`))).toBeNull();
  });

  it("ignores client forwarding and host headers", () => {
    expect(secureOriginRedirect(new Request("https://saladeestudio.com.ar/api/v1/health", { headers: { "x-forwarded-proto": "http", host: "evil.test" } }))).toBeNull();
  });
});
