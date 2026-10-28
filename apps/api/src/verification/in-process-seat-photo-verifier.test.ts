import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { InProcessSeatPhotoVerifier } from "./in-process-seat-photo-verifier.js";
import type { SeatLocator } from "./locator/seat-locator.js";
import type { SeatPhotoVerifierRequest } from "./seat-photo-verifier.js";
import { VerifierProviderError } from "./verifier-error.js";

const REQUEST: SeatPhotoVerifierRequest = {
  roomSlug: "principal",
  claimedSeatCode: "M04-S03",
  image: { mimeType: "image/jpeg", base64: "AAAA" },
  seats: [
    { code: "M04-S03", tableCode: "M04", x: 312, y: 640 },
    { code: "M04-S04", tableCode: "M04", x: 368, y: 640 },
  ],
};

let locate: Mock;
let verifier: InProcessSeatPhotoVerifier;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  locate = vi.fn().mockResolvedValue({ seatCode: "M04-S03", confidence: 0.93 });
  const locator: SeatLocator = { locate: (...args) => locate(...args) };
  verifier = new InProcessSeatPhotoVerifier(locator, "claude-sonnet-5-5", { timeoutMs: 50 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InProcessSeatPhotoVerifier", () => {
  it("distinguishes provider failures from ambiguous photos without exposing response contents", async () => {
    locate.mockRejectedValueOnce(new VerifierProviderError("QUOTA", "sensitive provider payload"));
    expect(await verifier.verify(REQUEST)).toMatchObject({ seatCode: null, confidence: 0, failure: "QUOTA" });
    expect(verifier.diagnostics()).toMatchObject({ provider: "anthropic", lastFailure: "QUOTA" });
    expect(JSON.stringify(verifier.diagnostics())).not.toContain("sensitive provider payload");
    expect(JSON.stringify(verifier.diagnostics())).not.toContain(REQUEST.claimedSeatCode);
    locate.mockResolvedValueOnce({ seatCode: null, confidence: 0 });
    expect(await verifier.verify(REQUEST)).not.toHaveProperty("failure");
    expect(verifier.diagnostics().lastFailure).toBeNull();
  });

  it("reports a timeout separately and allows the next attempt to succeed", async () => {
    locate.mockImplementationOnce((_req, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))));
    expect(await verifier.verify(REQUEST)).toMatchObject({ failure: "TIMEOUT" });
    expect(verifier.diagnostics().lastFailure).toBe("TIMEOUT");
    expect(await verifier.verify(REQUEST)).toMatchObject({ seatCode: "M04-S03" });
    expect(verifier.diagnostics().lastFailure).toBeNull();
  });
  it("passes a known seat code through with the model version", async () => {
    await expect(verifier.verify(REQUEST)).resolves.toEqual({
      seatCode: "M04-S03",
      confidence: 0.93,
      modelVersion: "sala-seat-v1:claude-sonnet-5-5",
    });
  });

  it("turns an unknown seat code into null and clamps confidence", async () => {
    locate.mockResolvedValueOnce({ seatCode: "Z99-S01", confidence: 0.99 });
    await expect(verifier.verify(REQUEST)).resolves.toMatchObject({ seatCode: null, confidence: 0 });
    locate.mockResolvedValueOnce({ seatCode: "M04-S04", confidence: 7 });
    await expect(verifier.verify(REQUEST)).resolves.toMatchObject({ seatCode: "M04-S04", confidence: 1 });
  });

  it("returns null/0 when the locator throws or times out", async () => {
    locate.mockRejectedValueOnce(new Error("boom"));
    await expect(verifier.verify(REQUEST)).resolves.toMatchObject({ seatCode: null, confidence: 0 });

    locate.mockImplementationOnce(
      (_req, signal: AbortSignal) =>
        new Promise((_res, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))),
    );
    await expect(verifier.verify(REQUEST)).resolves.toMatchObject({ seatCode: null, confidence: 0 });
  });

  it("rejects an invalid request or an oversize image without calling the model", async () => {
    await expect(verifier.verify({ ...REQUEST, seats: [] })).rejects.toThrow();
    const big = { ...REQUEST, image: { mimeType: "image/png" as const, base64: "A".repeat(8 * 1024 * 1024 + 1) } };
    await expect(verifier.verify(big)).rejects.toThrow("too large");
    expect(locate).not.toHaveBeenCalled();
  });

  it("never logs the image", async () => {
    await verifier.verify({ ...REQUEST, image: { mimeType: "image/jpeg", base64: "SECRETPHOTO" } });
    const logged = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(logged).toContain("verify");
    expect(logged).not.toContain("SECRETPHOTO");
  });
});
