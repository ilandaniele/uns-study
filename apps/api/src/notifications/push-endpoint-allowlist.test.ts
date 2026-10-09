import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./push-endpoint-allowlist.js";

describe("isAllowedPushEndpoint", () => {
  it("accepts known push services over https", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://some-shard.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-abc.notify.windows.com/w/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://jmt17.google.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://android.googleapis.com/gcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://push.services.mozilla.com.evil.example.com/x")).toBe(false);
  });

  it("rejects http (non-https) endpoints even on an otherwise-allowed host", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc123")).toBe(false);
  });

  it("rejects hosts not on the allowlist", () => {
    expect(isAllowedPushEndpoint("https://evil.example.com/collect")).toBe(false);
  });

  it("rejects a host that merely contains an allowed suffix as a substring, not a real subdomain", () => {
    expect(isAllowedPushEndpoint("https://notify.windows.com.evil.example.com/w")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedPushEndpoint("not-a-url")).toBe(false);
  });
});
