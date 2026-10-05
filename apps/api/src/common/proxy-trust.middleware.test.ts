import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { proxyTrustMiddleware } from "./proxy-trust.middleware.js";

describe("proxyTrustMiddleware", () => {
  let server: Server;

  async function start(secret: string) {
    const app = express();
    app.set("trust proxy", 2);
    app.use(proxyTrustMiddleware(secret));
    app.get("/", (req, res) => {
      res.json({ ip: req.ip, xff: req.headers["x-forwarded-for"] ?? null, secret: req.headers["x-sala-proxy-secret"] ?? null });
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  }

  async function get(url: string, headers: Record<string, string>) {
    return (await fetch(url, { headers })).json() as Promise<{ ip: string; xff: string | null; secret: string | null }>;
  }

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("is a no-op when the secret is empty", async () => {
    const url = await start("");
    const body = await get(url, { "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-sala-proxy-secret": "whatever" });
    expect(body.xff).toBe("1.1.1.1, 2.2.2.2");
    expect(body.ip).toBe("1.1.1.1");
  });

  it("keeps X-Forwarded-For when the secret matches, and hides the secret header", async () => {
    const url = await start("s3cret");
    const body = await get(url, { "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-sala-proxy-secret": "s3cret" });
    expect(body.xff).toBe("1.1.1.1, 2.2.2.2");
    expect(body.ip).toBe("1.1.1.1");
    expect(body.secret).toBeNull();
  });

  it("replaces a forged X-Forwarded-For with Fly-Client-IP on a direct hit", async () => {
    const url = await start("s3cret");
    const body = await get(url, { "x-forwarded-for": "6.6.6.6", "fly-client-ip": "203.0.113.9" });
    expect(body.xff).toBe("203.0.113.9");
    expect(body.ip).toBe("203.0.113.9");
  });

  it("drops X-Forwarded-For on a direct hit without Fly-Client-IP", async () => {
    const url = await start("s3cret");
    const body = await get(url, { "x-forwarded-for": "6.6.6.6" });
    expect(body.xff).toBeNull();
  });

  it("treats a wrong or different-length secret as a direct hit", async () => {
    const url = await start("s3cret");
    for (const wrong of ["s3creX", "short", "s3cret-and-more"]) {
      const body = await get(url, { "x-forwarded-for": "6.6.6.6", "fly-client-ip": "203.0.113.9", "x-sala-proxy-secret": wrong });
      expect(body.xff).toBe("203.0.113.9");
      expect(body.secret).toBeNull();
    }
  });
});
