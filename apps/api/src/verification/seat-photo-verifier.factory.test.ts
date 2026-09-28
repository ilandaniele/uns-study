import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../env.js";
import { createSeatPhotoVerifier } from "./seat-photo-verifier.factory.js";
import { HttpSeatPhotoVerifier } from "./http-seat-photo-verifier.js";
import { MockSeatPhotoVerifier } from "./mock-seat-photo-verifier.js";

describe("createSeatPhotoVerifier", () => {
  const original = { ...env };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.assign(env, original);
    vi.restoreAllMocks();
  });

  it("refuses a non-https SEAT_VERIFIER_URL in production (disabled, not a silent downgrade)", () => {
    env.isProduction = true;
    env.seatVerifierUrl = "http://insecure-verifier.example.com";
    env.seatVerifierMode = "";

    const verifier = createSeatPhotoVerifier();

    expect(verifier).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("wires up an https SEAT_VERIFIER_URL in production", () => {
    env.isProduction = true;
    env.seatVerifierUrl = "https://verifier.example.com";
    env.seatVerifierMode = "";

    const verifier = createSeatPhotoVerifier();

    expect(verifier).toBeInstanceOf(HttpSeatPhotoVerifier);
  });

  it("accepts a non-https SEAT_VERIFIER_URL outside production", () => {
    env.isProduction = false;
    env.seatVerifierUrl = "http://localhost:9999";
    env.seatVerifierMode = "";

    const verifier = createSeatPhotoVerifier();

    expect(verifier).toBeInstanceOf(HttpSeatPhotoVerifier);
  });

  it("ignores SEAT_VERIFIER_MODE=mock in production", () => {
    env.isProduction = true;
    env.seatVerifierUrl = "";
    env.seatVerifierMode = "mock";

    const verifier = createSeatPhotoVerifier();

    expect(verifier).toBeNull();
  });

  it("uses the mock verifier (with a loud startup warning) outside production", () => {
    env.isProduction = false;
    env.seatVerifierUrl = "";
    env.seatVerifierMode = "mock";

    const verifier = createSeatPhotoVerifier();

    expect(verifier).toBeInstanceOf(MockSeatPhotoVerifier);
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null when nothing is configured", () => {
    env.isProduction = false;
    env.seatVerifierUrl = "";
    env.seatVerifierMode = "";

    expect(createSeatPhotoVerifier()).toBeNull();
  });
});
