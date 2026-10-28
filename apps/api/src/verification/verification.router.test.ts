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
  it("names the image recipient without exposing model settings or attempt diagnostics", async () => {
    const verifier = {
      verify: async () => ({ seatCode: null, confidence: 0, modelVersion: "test" }),
      diagnostics: () => ({ provider: "gemini" as const, model: "private-model-config", lastAttemptAt: "2026-10-27T15:00:00Z", lastFailure: "QUOTA" as const }),
    };
    const response = await appWith(verifier).request("/api/v1/verification/status");
    expect(await response.json()).toEqual({ enabled: true, provider: "gemini" });
  });
  it("reports enabled when a verifier is configured", async () => {
    const res = await appWith(new MockSeatPhotoVerifier()).request("/api/v1/verification/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, provider: null });
  });

  it("reports disabled when none is", async () => {
    const res = await appWith(null).request("/api/v1/verification/status");
    expect(await res.json()).toEqual({ enabled: false, provider: null });
  });
});
