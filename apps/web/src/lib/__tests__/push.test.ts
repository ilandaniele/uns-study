import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, apiPostMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn(), apiPostMock: vi.fn() }));
vi.mock("../api", () => ({ apiFetch: apiFetchMock, apiPost: apiPostMock }));

import { base64UrlToUint8Array, enablePushNotificationsDetailed, pushFailureMessage } from "../push";

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

describe("enablePushNotificationsDetailed", () => {
  const KEY = btoa(String.fromCharCode(...new Uint8Array(65).map((_, i) => i))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  function fakeSubscription(keyBytes: Uint8Array | null) {
    return {
      options: { applicationServerKey: keyBytes ? keyBytes.buffer : null },
      unsubscribe: vi.fn(async () => true),
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: KEY, auth: "AgICAgICAgICAgICAgICAg" },
      }),
    };
  }

  function setup(opts: {
    permission?: NotificationPermission;
    request?: () => Promise<NotificationPermission>;
    existing?: ReturnType<typeof fakeSubscription> | null;
    subscribe?: () => Promise<unknown>;
    ready?: Promise<unknown>;
  }) {
    const pushManager = {
      getSubscription: vi.fn(async () => opts.existing ?? null),
      subscribe: vi.fn(opts.subscribe ?? (async () => fakeSubscription(base64UrlToUint8Array(KEY)))),
    };
    const registration = { pushManager };
    const notification = Object.assign(function Notification() {}, {
      permission: opts.permission ?? "default",
      requestPermission: vi.fn(opts.request ?? (async () => "granted" as NotificationPermission)),
    });
    vi.stubGlobal("Notification", notification);
    vi.stubGlobal("PushManager", function PushManager() {});
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
      serviceWorker: {
        getRegistration: vi.fn(async () => registration),
        register: vi.fn(async () => registration),
        ready: opts.ready ?? Promise.resolve(registration),
      },
    });
    return { pushManager, notification };
  }

  beforeEach(() => {
    apiFetchMock.mockReset().mockResolvedValue({ publicKey: KEY });
    apiPostMock.mockReset().mockResolvedValue({});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("subscribes and registers the subscription", async () => {
    const { pushManager } = setup({});
    await expect(enablePushNotificationsDetailed()).resolves.toEqual({ ok: true });
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(apiPostMock).toHaveBeenCalledOnce();
  });

  it("reports a dismissed permission prompt", async () => {
    setup({ request: async () => "default" });
    await expect(enablePushNotificationsDetailed()).resolves.toEqual({ ok: false, reason: "permission-dismissed" });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("reports a denied permission", async () => {
    setup({ request: async () => "denied" });
    await expect(enablePushNotificationsDetailed()).resolves.toMatchObject({ ok: false, reason: "permission-denied" });
  });

  it("reports a push service failure with the error name instead of throwing", async () => {
    setup({
      subscribe: async () => {
        throw new DOMException("Registration failed - push service not available", "AbortError");
      },
    });
    await expect(enablePushNotificationsDetailed()).resolves.toEqual({ ok: false, reason: "push-service", detail: "AbortError" });
  });

  it("replaces a subscription made with an old VAPID key", async () => {
    const stale = fakeSubscription(new Uint8Array(65).fill(9));
    const { pushManager } = setup({ permission: "granted", existing: stale });
    await expect(enablePushNotificationsDetailed()).resolves.toEqual({ ok: true });
    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
  });

  it("reuses a subscription made with the current key", async () => {
    const current = fakeSubscription(base64UrlToUint8Array(KEY));
    const { pushManager } = setup({ permission: "granted", existing: current });
    await expect(enablePushNotificationsDetailed()).resolves.toEqual({ ok: true });
    expect(current.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("gives up when the service worker never becomes ready", async () => {
    vi.useFakeTimers();
    setup({ permission: "granted", ready: new Promise(() => {}) });
    const pending = enablePushNotificationsDetailed();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ ok: false, reason: "no-service-worker" });
  });

  it("reports a server failure when saving the subscription", async () => {
    setup({ permission: "granted" });
    apiPostMock.mockRejectedValue(new Error("boom"));
    await expect(enablePushNotificationsDetailed()).resolves.toMatchObject({ ok: false, reason: "server" });
  });

  it("explains every failure in Spanish", () => {
    expect(pushFailureMessage({ ok: false, reason: "push-service", detail: "AbortError" })).toContain("(código: AbortError)");
    expect(pushFailureMessage({ ok: false, reason: "permission-dismissed" })).toContain("Permitir");
  });
});
