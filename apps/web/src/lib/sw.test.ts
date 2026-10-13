import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Runs the real public/sw.js in a sandbox with a fake ServiceWorkerGlobalScope, so the push and
// notificationclick handlers are checked deterministically (window focus can't be controlled in a browser test).
const SOURCE = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://saladeestudio.com.ar";

type FakeClient = {
  visibilityState: string;
  focused: boolean;
  navigate?: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
};

function loadWorker(clients: FakeClient[] = []) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn(async (_title: string, _options: unknown) => {});
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: ORIGIN },
    navigator: { setAppBadge: vi.fn(async () => {}) },
    registration: { showNotification },
    clients: { matchAll: vi.fn(async () => clients), openWindow, claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
  };
  vm.runInNewContext(SOURCE, { self, caches: { keys: async () => [], delete: async () => true }, URL });
  return { listeners, showNotification, openWindow };
}

async function dispatch(listener: (event: unknown) => void, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  listener({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

function pushEvent(payload: unknown) {
  return { data: { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) } };
}

const focused = (): FakeClient => ({ visibilityState: "visible", focused: true, focus: vi.fn() });
const background = (): FakeClient => ({ visibilityState: "hidden", focused: false, focus: vi.fn() });

describe("sw.js push", () => {
  it("shows the notification with title, body, tag and a same-origin url", async () => {
    const w = loadWorker();
    await dispatch(w.listeners.push!, pushEvent({ title: "Hola", body: "b", url: "/mensajes?x=1", tag: "t1" }));
    expect(w.showNotification).toHaveBeenCalledWith("Hola", {
      body: "b",
      tag: "t1",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: "/mensajes?x=1" },
    });
  });

  it("rewrites an off-origin url to /", async () => {
    const w = loadWorker();
    await dispatch(w.listeners.push!, pushEvent({ title: "x", body: "b", url: "https://evil.example.com/a", tag: "t" }));
    expect(w.showNotification.mock.calls[0]![1]).toMatchObject({ data: { url: "/" } });
  });

  it("stays silent for a DM while the app is focused", async () => {
    const w = loadWorker([focused()]);
    await dispatch(w.listeners.push!, pushEvent({ title: "DM", body: "b", url: "/mensajes", tag: "dm-1" }));
    expect(w.showNotification).not.toHaveBeenCalled();
  });

  it("shows a DM when the app is only open in the background", async () => {
    const w = loadWorker([background()]);
    await dispatch(w.listeners.push!, pushEvent({ title: "DM", body: "b", url: "/mensajes", tag: "dm-1" }));
    expect(w.showNotification).toHaveBeenCalledOnce();
  });

  it("shows non-DM pushes even while the app is focused", async () => {
    const w = loadWorker([focused()]);
    await dispatch(w.listeners.push!, pushEvent({ title: "Sigo acá", body: "b", url: "/", tag: "checkin-reminder" }));
    expect(w.showNotification).toHaveBeenCalledOnce();
  });

  it("ignores a push without data or with malformed JSON", async () => {
    const w = loadWorker();
    w.listeners.push!({ data: null, waitUntil: vi.fn() });
    w.listeners.push!({
      data: {
        json: () => {
          throw new SyntaxError("bad");
        },
      },
      waitUntil: vi.fn(),
    });
    expect(w.showNotification).not.toHaveBeenCalled();
  });
});

describe("sw.js notificationclick", () => {
  const click = (url: string) => ({ notification: { close: vi.fn(), data: { url } } });

  it("navigates and focuses an open tab", async () => {
    const tab = { ...background(), navigate: vi.fn(async () => {}) };
    const w = loadWorker([tab]);
    await dispatch(w.listeners.notificationclick!, click("/mensajes"));
    expect(tab.navigate).toHaveBeenCalledWith("/mensajes");
    expect(tab.focus).toHaveBeenCalled();
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window when navigate rejects on an uncontrolled tab", async () => {
    const tab = { ...background(), navigate: vi.fn(async () => Promise.reject(new TypeError("not controlled"))) };
    const w = loadWorker([tab]);
    await dispatch(w.listeners.notificationclick!, click("/mensajes"));
    expect(w.openWindow).toHaveBeenCalledWith("/mensajes");
  });

  it("opens a new window when no tab is open, never off-origin", async () => {
    const w = loadWorker([]);
    await dispatch(w.listeners.notificationclick!, click("https://evil.example.com/"));
    expect(w.openWindow).toHaveBeenCalledWith("/");
  });
});
