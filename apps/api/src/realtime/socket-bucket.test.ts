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
});

describe("socketClientIp", () => {
  it("prefers fly-client-ip, falls back to the handshake address", () => {
    expect(socketClientIp({ "fly-client-ip": "1.2.3.4" }, "10.0.0.1")).toBe("1.2.3.4");
    expect(socketClientIp({}, "10.0.0.1")).toBe("10.0.0.1");
  });
});
