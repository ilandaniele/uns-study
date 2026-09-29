import { describe, expect, it } from "vitest";
import { base64UrlToUint8Array } from "../push";

describe("base64UrlToUint8Array", () => {
  it("decodes a URL-safe base64 string with no padding needed", () => {
    // "test" -> base64 "dGVzdA==" -> url-safe (padding stripped) "dGVzdA"
    const bytes = base64UrlToUint8Array("dGVzdA");
    expect(Array.from(bytes)).toEqual([116, 101, 115, 116]); // "test"
  });

  it("decodes a string that needs padding restored", () => {
    // "hi" -> base64 "aGk=" -> url-safe "aGk"
    const bytes = base64UrlToUint8Array("aGk");
    expect(Array.from(bytes)).toEqual([104, 105]); // "hi"
  });

  it("replaces url-safe characters (-, _) back to standard base64 (+, /) before decoding", () => {
    // Bytes [0xfb, 0xff, 0xbf] -> standard base64 "+/+/" -> url-safe "-_-_"
    const bytes = base64UrlToUint8Array("-_-_");
    expect(Array.from(bytes)).toEqual([251, 255, 191]);
  });

  it("round-trips a real-looking VAPID key length (65 raw bytes, uncompressed EC point)", () => {
    const raw = new Uint8Array(65).map((_, i) => i);
    const base64Url = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(Array.from(base64UrlToUint8Array(base64Url))).toEqual(Array.from(raw));
  });
});
