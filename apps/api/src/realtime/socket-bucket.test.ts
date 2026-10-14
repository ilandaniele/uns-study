import { describe, expect, it } from "vitest";
import { socketClientIp, takeSocketToken, type SocketBucket } from "./socket-bucket.js";

describe("takeSocketToken", () => {
  it("allows `limit` events per window, then refuses until the window rolls over", () => {
    const bucket: SocketBucket = { count: 0, windowStart: 0 };
    for (let i = 0; i < 10; i++) expect(takeSocketToken(bucket, 1_000 + i, 10, 10_000)).toBe(true);
    expect(takeSocketToken(bucket, 5_000, 10, 10_000)).toBe(false);
    expect(takeSocketToken(bucket, 9_999, 10, 10_000)).toBe(false);
    expect(takeSocketToken(bucket, 10_000, 10, 10_000)).toBe(true);
  });

  it("survives a JSON round trip (attachment serialization)", () => {
    const bucket: SocketBucket = { count: 0, windowStart: 0 };
    takeSocketToken(bucket, 100, 10, 10_000);
    const restored = JSON.parse(JSON.stringify(bucket)) as SocketBucket;
    expect(restored).toEqual({ count: 1, windowStart: 0 });
  });
});

describe("socketClientIp", () => {
  it("prefers cf-connecting-ip, falls back to loopback", () => {
    expect(socketClientIp(new Headers({ "cf-connecting-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(socketClientIp(new Headers())).toBe("127.0.0.1");
  });
});
