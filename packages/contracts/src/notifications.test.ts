import { describe, expect, it } from "vitest";
import { pushSubscriptionSchema, unsubscribePushSchema } from "./notifications.js";

const P256DH_65_BYTES = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
const P256DH_64_BYTES = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ";
const AUTH_16_BYTES = "AgICAgICAgICAgICAgICAg";

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: P256DH_65_BYTES, auth: AUTH_16_BYTES },
};

describe("pushSubscriptionSchema", () => {
  it("accepts a well-formed subscription", () => {
    expect(pushSubscriptionSchema.safeParse(validSubscription).success).toBe(true);
  });

  it("rejects a p256dh key that doesn't decode to 65 bytes", () => {
    const result = pushSubscriptionSchema.safeParse({ ...validSubscription, keys: { ...validSubscription.keys, p256dh: P256DH_64_BYTES } });
    expect(result.success).toBe(false);
  });

  it("rejects an auth secret that doesn't decode to 16 bytes", () => {
    const result = pushSubscriptionSchema.safeParse({ ...validSubscription, keys: { ...validSubscription.keys, auth: P256DH_65_BYTES } });
    expect(result.success).toBe(false);
  });

  it("rejects keys that aren't valid base64url at all", () => {
    const result = pushSubscriptionSchema.safeParse({ ...validSubscription, keys: { p256dh: "not base64!!", auth: AUTH_16_BYTES } });
    expect(result.success).toBe(false);
  });

  it("rejects an endpoint longer than 2048 characters", () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${"a".repeat(2048)}`;
    expect(pushSubscriptionSchema.safeParse({ ...validSubscription, endpoint }).success).toBe(false);
  });
});

describe("unsubscribePushSchema", () => {
  it("rejects an endpoint longer than 2048 characters", () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${"a".repeat(2048)}`;
    expect(unsubscribePushSchema.safeParse({ endpoint }).success).toBe(false);
  });
});
