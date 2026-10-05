import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";

// `NextResponse.next({ request: { headers } })` surfaces the forwarded request headers on the
// response as `x-middleware-request-<name>` (and lists the overrides in `x-middleware-override-headers`).
function forwarded(res: Response, name: string) {
  return res.headers.get(`x-middleware-request-${name}`);
}

describe("proxy shared secret", () => {
  const original = process.env.PROXY_SHARED_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.PROXY_SHARED_SECRET;
    else process.env.PROXY_SHARED_SECRET = original;
  });

  it("adds the secret on /api/v1 and /api/auth requests", () => {
    process.env.PROXY_SHARED_SECRET = "s3cret";
    for (const path of ["/api/v1/rooms", "/api/auth/get-session"]) {
      const res = proxy(new NextRequest(`https://example.test${path}`, { headers: { host: "example.test" } }));
      expect(forwarded(res, "x-sala-proxy-secret")).toBe("s3cret");
    }
  });

  it("overwrites a client-supplied secret on API paths", () => {
    process.env.PROXY_SHARED_SECRET = "s3cret";
    const res = proxy(new NextRequest("https://example.test/api/v1/rooms", { headers: { host: "example.test", "x-sala-proxy-secret": "forged" } }));
    expect(forwarded(res, "x-sala-proxy-secret")).toBe("s3cret");
  });

  it("does not add the secret to other paths, and strips a client-supplied one", () => {
    process.env.PROXY_SHARED_SECRET = "s3cret";
    const plain = proxy(new NextRequest("https://example.test/map", { headers: { host: "example.test" } }));
    expect(forwarded(plain, "x-sala-proxy-secret")).toBeNull();
    const forged = proxy(new NextRequest("https://example.test/map", { headers: { host: "example.test", "x-sala-proxy-secret": "forged" } }));
    expect(forwarded(forged, "x-sala-proxy-secret")).not.toBe("forged");
    expect(forged.headers.get("x-middleware-override-headers") ?? "").not.toContain("x-sala-proxy-secret-value");
  });

  it("adds nothing when the secret is unset, but still drops a forged one", () => {
    delete process.env.PROXY_SHARED_SECRET;
    const res = proxy(new NextRequest("https://example.test/api/v1/rooms", { headers: { host: "example.test", "x-sala-proxy-secret": "forged" } }));
    expect(forwarded(res, "x-sala-proxy-secret")).toBeNull();
  });
});

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

  it.each(["uns-study.vercel.app", "sala-de-estudio.fly.dev", "www.saladeestudio.com.ar"])(
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

  it("still adds the proxy secret on API paths (which skip the CSP)", () => {
    process.env.PROXY_SHARED_SECRET = "s3cret";
    try {
      const res = proxy(new NextRequest("https://example.test/api/v1/rooms", { headers: { host: "example.test" } }));
      expect(forwarded(res, "x-sala-proxy-secret")).toBe("s3cret");
    } finally {
      delete process.env.PROXY_SHARED_SECRET;
    }
  });
});
