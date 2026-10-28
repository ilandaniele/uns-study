import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { buildCsp } from "../csp";

// `NextResponse.next({ request: { headers } })` surfaces the forwarded request headers on the
// response as `x-middleware-request-<name>` (and lists the overrides in `x-middleware-override-headers`).
function forwarded(res: Response, name: string) {
  return res.headers.get(`x-middleware-request-${name}`);
}

describe("proxy CSP nonce", () => {
  const page = () => proxy(new NextRequest("https://example.test/sala/principal", { headers: { host: "example.test" } }));

  it("sets a nonce-based script-src without unsafe-inline, and forwards the nonce to Next", () => {
    const res = page();
    const csp = res.headers.get("content-security-policy") ?? "";
    const nonce = forwarded(res, "x-nonce");
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp.split("; ").find((d) => d.startsWith("script-src"))).not.toContain("'unsafe-inline'");
    expect(forwarded(res, "content-security-policy")).toBe(csp);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("uses a different nonce on every request", () => {
    expect(forwarded(page(), "x-nonce")).not.toBe(forwarded(page(), "x-nonce"));
  });

  it("skips the CSP for static assets", () => {
    const res = proxy(new NextRequest("https://example.test/_next/static/chunk.js", { headers: { host: "example.test" } }));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it.each(["www.saladeestudio.com.ar"])(
    "redirects the old host %s to the canonical domain, without a CSP",
    (host) => {
      const res = proxy(new NextRequest("https://" + host + "/mapa?x=1", { headers: { host } }));
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://saladeestudio.com.ar/mapa?x=1");
      expect(res.headers.get("content-security-policy")).toBeNull();
    },
  );

  it("serves the canonical domain without redirecting", () => {
    const res = proxy(new NextRequest("https://saladeestudio.com.ar/mapa", { headers: { host: "saladeestudio.com.ar" } }));
    expect(res.status).toBe(200);
  });

  it.each(["saladeestudio.com.ar", "dev.saladeestudio.com.ar"])("upgrades HTTP on %s before rendering the login page", host => {
    const res = proxy(new NextRequest(`http://${host}/login?next=%2Fjardin`, { headers: { host } }));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`https://${host}/login?next=%2Fjardin`);
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("keeps local HTTP development and unrecognized hosts unchanged", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "example.test"]) {
      const res = proxy(new NextRequest(`http://${host}/login`, { headers: { host } }));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("does not downgrade or loop on a secure request with a forged forwarding header", () => {
    const res = proxy(new NextRequest("https://saladeestudio.com.ar/login", { headers: { host: "saladeestudio.com.ar", "x-forwarded-proto": "http" } }));
    expect(res.status).toBe(200);
  });

  it("does not run the CSP on API paths", () => {
    const res = proxy(new NextRequest("https://example.test/api/v1/rooms", { headers: { host: "example.test" } }));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("allows the same-origin WebSocket in production", () => {
    const csp = buildCsp("n", false);
    expect(csp).toContain("wss://saladeestudio.com.ar");
  });
});
