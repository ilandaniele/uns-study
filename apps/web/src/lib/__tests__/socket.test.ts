import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const peekMe = vi.fn();
vi.mock("../api", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
vi.mock("../me-store", () => ({ peekMe: () => peekMe() }));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  open() {
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  drop(code = 1006, reason = "") {
    this.onclose?.({ code, reason });
  }
}

const last = () => MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

async function load() {
  vi.resetModules();
  return import("../socket");
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  apiFetch.mockReset();
  peekMe.mockReset();
  apiFetch.mockResolvedValue({ token: "tok-1", expiresAt: Date.now() + 300_000 });
  peekMe.mockReturnValue(undefined);
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("window", { location: { protocol: "https:", host: "saladeestudio.com.ar" } });
  delete process.env.NEXT_PUBLIC_SOCKET_URL;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_SOCKET_URL;
});

describe("getSocket", () => {
  it("returns an inert stub during SSR", async () => {
    vi.unstubAllGlobals();
    const { getSocket } = await load();
    const s = getSocket();
    s.emit("x").connect().on("connect", () => undefined);
    await flush();
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(s.connected).toBe(false);
  });

  it("connects to the same-origin ws URL with the token, and is a singleton", async () => {
    const { getSocket } = await load();
    const s = getSocket();
    expect(getSocket()).toBe(s);
    await flush();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(last().url).toBe("wss://saladeestudio.com.ar/api/v1/realtime/ws?token=tok-1");
  });

  it("uses NEXT_PUBLIC_SOCKET_URL converted to ws(s)", async () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = "http://localhost:4000";
    const { getSocket } = await load();
    getSocket();
    await flush();
    expect(last().url).toBe("ws://localhost:4000/api/v1/realtime/ws?token=tok-1");
  });

  it("connects anonymously when the visitor is known to be signed out", async () => {
    peekMe.mockReturnValue({ user: null });
    const { getSocket } = await load();
    getSocket();
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(last().url).toBe("wss://saladeestudio.com.ar/api/v1/realtime/ws");
  });

  it("connects anonymously when the token endpoint answers 401", async () => {
    const { ApiRequestError } = await import("../api");
    apiFetch.mockRejectedValue(new (ApiRequestError as unknown as new (m: string, s: number) => Error)("no", 401));
    const { getSocket } = await load();
    getSocket();
    await flush();
    expect(last().url).toBe("wss://saladeestudio.com.ar/api/v1/realtime/ws");
  });
});

describe("events", () => {
  it("fires connect/disconnect and server events, and off() detaches", async () => {
    const { getSocket } = await load();
    const s = getSocket();
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onSeat = vi.fn();
    s.on("connect", onConnect).on("disconnect", onDisconnect).on("seat:state-changed", onSeat);
    await flush();
    expect(s.connected).toBe(false);
    last().open();
    expect(s.connected).toBe(true);
    expect(onConnect).toHaveBeenCalledTimes(1);

    last().message({ e: "seat:state-changed", d: { seatId: "a" } });
    expect(onSeat).toHaveBeenCalledWith({ seatId: "a" });
    s.off("seat:state-changed", onSeat);
    last().message({ e: "seat:state-changed", d: { seatId: "b" } });
    expect(onSeat).toHaveBeenCalledTimes(1);

    last().drop(1006);
    expect(s.connected).toBe(false);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed server frames", async () => {
    const { getSocket } = await load();
    const s = getSocket();
    const h = vi.fn();
    s.on("x", h);
    await flush();
    last().open();
    last().message("garbage");
    last().message({ nope: 1 });
    expect(h).not.toHaveBeenCalled();
  });
});

describe("emit", () => {
  it("buffers until open, then flushes in order", async () => {
    const { getSocket } = await load();
    const s = getSocket();
    s.emit("room:join", { roomId: "r1" });
    s.emit("chat:join", { roomId: "c1" });
    await flush();
    const ws = last();
    expect(ws.sent).toEqual([]);
    ws.open();
    expect(ws.sent.map((f) => JSON.parse(f))).toEqual([
      { e: "room:join", d: { roomId: "r1" } },
      { e: "chat:join", d: { roomId: "c1" } },
    ]);
  });

  it("round-trips an ack by id", async () => {
    const { getSocket } = await load();
    const s = getSocket();
    await flush();
    last().open();
    const ack = vi.fn();
    s.emit("room:join", { roomId: "r1" }, ack);
    const frame = JSON.parse(last().sent[0]!) as { id: number };
    expect(typeof frame.id).toBe("number");
    last().message({ ack: frame.id, d: { joined: true } });
    expect(ack).toHaveBeenCalledWith({ joined: true });
    last().message({ ack: frame.id, d: { joined: true } });
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it("joinChat/leaveChat emit the chat events", async () => {
    const { getSocket, joinChat, leaveChat } = await load();
    getSocket();
    await flush();
    last().open();
    joinChat("c1");
    leaveChat("c1");
    expect(last().sent.map((f) => JSON.parse(f))).toEqual([
      { e: "chat:join", d: { roomId: "c1" } },
      { e: "chat:leave", d: { roomId: "c1" } },
    ]);
  });
});

describe("reconnect", () => {
  it("backs off exponentially, fetching a fresh token per attempt", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // zero jitter
    apiFetch.mockImplementation(async () => ({ token: `t${apiFetch.mock.calls.length}`, expiresAt: 0 })); // always expired
    const { getSocket } = await load();
    getSocket();
    await flush();
    expect(MockWebSocket.instances).toHaveLength(1);

    last().drop(); // never opened: attempt 0 -> 500 ms
    await vi.advanceTimersByTimeAsync(499);
    expect(MockWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    last().drop(); // 1000 ms
    await vi.advanceTimersByTimeAsync(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(MockWebSocket.instances.map((w) => w.url.split("token=")[1])).toEqual(["t1", "t2", "t3"]);
  });

  it("caps the delay at 10 s", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { getSocket } = await load();
    getSocket();
    await flush();
    for (let i = 0; i < 8; i++) {
      last().drop();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    const before = MockWebSocket.instances.length;
    last().drop();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(MockWebSocket.instances).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(before + 1);
  });

  it("resets the backoff after the connection stayed open for 30 s", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { getSocket } = await load();
    getSocket();
    await flush();
    last().drop();
    await vi.advanceTimersByTimeAsync(500);
    last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    last().open();
    await vi.advanceTimersByTimeAsync(30_000);
    last().drop();
    const n = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(MockWebSocket.instances).toHaveLength(n + 1);
  });

  it("does not reconnect after a manual disconnect, until connect()", async () => {
    const { getSocket } = await load();
    const s = getSocket();
    const onDisconnect = vi.fn();
    s.on("disconnect", onDisconnect);
    await flush();
    last().open();
    s.disconnect();
    expect(onDisconnect).toHaveBeenCalledWith("io client disconnect");
    expect(last().closed?.code).toBe(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    s.connect();
    await flush();
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("a disconnect during the token fetch cancels that attempt", async () => {
    let release!: (v: unknown) => void;
    apiFetch.mockImplementation(() => new Promise((r) => (release = r)));
    const { getSocket } = await load();
    const s = getSocket();
    s.disconnect();
    release({ token: "late", expiresAt: Date.now() + 300_000 });
    await flush();
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

describe("resetSocket", () => {
  it("drops the connection and reconnects with a fresh token", async () => {
    const { getSocket, resetSocket } = await load();
    getSocket();
    await flush();
    last().open();
    apiFetch.mockResolvedValue({ token: "tok-2", expiresAt: Date.now() + 300_000 });
    resetSocket();
    await flush();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(last().url).toContain("token=tok-2");
  });

  it("is a no-op before the socket exists", async () => {
    const { resetSocket } = await load();
    resetSocket();
    await flush();
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

describe("heartbeat", () => {
  it("sends ping every 25 s and stays up while pongs arrive", async () => {
    const { getSocket } = await load();
    const s = getSocket();
    await flush();
    const ws = last();
    ws.open();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(ws.sent).toEqual(["ping"]);
    ws.message("pong");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.connected).toBe(true);
    expect(ws.closed).toBeNull();
  });

  it("closes and reconnects when no pong arrives within 10 s", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { getSocket } = await load();
    const s = getSocket();
    const onDisconnect = vi.fn();
    s.on("disconnect", onDisconnect);
    await flush();
    const ws = last();
    ws.open();
    await vi.advanceTimersByTimeAsync(25_000 + 10_000);
    expect(ws.closed).not.toBeNull();
    expect(s.connected).toBe(false);
    expect(onDisconnect).toHaveBeenCalledWith("ping timeout");
    await vi.advanceTimersByTimeAsync(500);
    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
