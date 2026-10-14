import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../http/context.js";
import type { Services } from "../services.js";
import { MockSeatPhotoVerifier } from "./mock-seat-photo-verifier.js";
import { verificationRouter } from "./verification.router.js";

function appWith(verifier: Services["seatPhotoVerifier"]) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("services", { seatPhotoVerifier: verifier } as unknown as Services);
    await next();
  });
  app.route("/api/v1", verificationRouter);
  return app;
}

describe("GET /verification/status", () => {
  it("reports enabled when a verifier is configured", async () => {
    const res = await appWith(new MockSeatPhotoVerifier()).request("/api/v1/verification/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true });
  });

  it("reports disabled when none is", async () => {
    const res = await appWith(null).request("/api/v1/verification/status");
    expect(await res.json()).toEqual({ enabled: false });
  });
});
