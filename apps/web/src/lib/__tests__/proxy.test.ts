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
