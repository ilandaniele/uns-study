import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSeatPhotoVerifier } from "./http-seat-photo-verifier.js";

const REQUEST = {
  roomSlug: "sala-principal",
  claimedSeatCode: "M04-3",
  image: { mimeType: "image/jpeg" as const, base64: "AAA" },
  seats: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("HttpSeatPhotoVerifier", () => {
  it("parses a well-formed response", async () => {
    stubFetch(new Response(JSON.stringify({ seatCode: "M04-3", confidence: 0.9, modelVersion: "v1" }), { status: 200 }));
    const verifier = new HttpSeatPhotoVerifier("https://verifier.example.com");

    await expect(verifier.verify(REQUEST)).resolves.toEqual({ seatCode: "M04-3", confidence: 0.9, modelVersion: "v1" });
  });

  it("rejects a response whose declared Content-Length exceeds the cap, without buffering the body", async () => {
    const oversized = "x".repeat(200_000);
    stubFetch(
      new Response(oversized, {
        status: 200,
        headers: { "content-length": String(oversized.length) },
      }),
    );
    const verifier = new HttpSeatPhotoVerifier("https://verifier.example.com");

    await expect(verifier.verify(REQUEST)).rejects.toThrow(/too large/i);
  });

  it("rejects a streamed response that exceeds the cap even without a Content-Length header", async () => {
    const chunk = new Uint8Array(20_000).fill(65);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(chunk); // 100KB total, over the 64KB cap
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    stubFetch(response);
    const verifier = new HttpSeatPhotoVerifier("https://verifier.example.com");

    await expect(verifier.verify(REQUEST)).rejects.toThrow(/too large/i);
  });

  it("throws on a non-2xx response", async () => {
    stubFetch(new Response("nope", { status: 500 }));
    const verifier = new HttpSeatPhotoVerifier("https://verifier.example.com");

    await expect(verifier.verify(REQUEST)).rejects.toThrow(/responded 500/);
  });
});
