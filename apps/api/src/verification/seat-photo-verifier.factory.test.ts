import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../env.js";
import { createSeatPhotoVerifier } from "./seat-photo-verifier.factory.js";
import { InProcessSeatPhotoVerifier } from "./in-process-seat-photo-verifier.js";
import { MockSeatPhotoVerifier } from "./mock-seat-photo-verifier.js";

describe("createSeatPhotoVerifier", () => {
  const original = { ...env };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    env.geminiApiKey = "";
    env.anthropicApiKey = "";
    env.verifierModel = "";
  });

  afterEach(() => {
    Object.assign(env, original);
    vi.restoreAllMocks();
  });

  it("ignores SEAT_VERIFIER_MODE=mock in production", () => {
    env.isProduction = true;
    env.seatVerifierMode = "mock";

    const verifier = createSeatPhotoVerifier();

    expect(verifier).toBeNull();
  });

  it("uses the mock verifier (with a loud startup warning) outside production", () => {
    env.isProduction = false;
    env.seatVerifierMode = "mock";

    const verifier = createSeatPhotoVerifier();

    expect(verifier).toBeInstanceOf(MockSeatPhotoVerifier);
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null when nothing is configured", () => {
    env.isProduction = false;
    env.seatVerifierMode = "";

    expect(createSeatPhotoVerifier()).toBeNull();
  });

  it("uses the in-process verifier when a Gemini key is set", () => {
    env.isProduction = true;
    env.geminiApiKey = "g-key";
    env.seatVerifierMode = "";

    expect(createSeatPhotoVerifier()).toBeInstanceOf(InProcessSeatPhotoVerifier);
  });

  it("uses the in-process verifier with only an Anthropic key", () => {
    env.isProduction = true;
    env.anthropicApiKey = "a-key";
    env.seatVerifierMode = "";

    expect(createSeatPhotoVerifier()).toBeInstanceOf(InProcessSeatPhotoVerifier);
  });

  it("prefers a model key over the dev mock", () => {
    env.isProduction = false;
    env.geminiApiKey = "g-key";
    env.seatVerifierMode = "mock";

    expect(createSeatPhotoVerifier()).toBeInstanceOf(InProcessSeatPhotoVerifier);
  });

  it("takes an explicit env argument instead of the singleton", () => {
    const verifier = createSeatPhotoVerifier({ ...env, isProduction: false, seatVerifierMode: "mock" });
    expect(verifier).toBeInstanceOf(MockSeatPhotoVerifier);
  });
});
