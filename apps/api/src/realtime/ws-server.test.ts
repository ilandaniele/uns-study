import { describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { ApiErrors } from "../common/api-error.js";
import { FakeSocketState, FakeWebSocket } from "./fake-socket-state.js";
import { signSocketToken } from "./socket-token.js";
import { RealtimeSockets, type SessionLookup, type SocketAttachment } from "./ws-server.js";
import { encodeClientFrame } from "./ws-protocol.js";

const ROOM = "289306e1-e5f2-4cb6-ac63-9ae49e986e04";
const ROOMS = Array.from({ length: 7 }, (_, i) => `289306e1-e5f2-4cb6-ac63-9ae49e986e0${i}`);
const ORIGIN = "https://saladeestudio.com.ar";

function setup(opts: { sessions?: Partial<SessionLookup>; blockedTypes?: string[]; getSession?: () => Promise<unknown> } = {}) {
  const state = new FakeSocketState();
  const upgraded: FakeWebSocket[] = [];
  const clock = { t: 1_000_000 };
  const assertNot = vi.fn(async (_userId: string, types: string[]) => {
    if (opts.blockedTypes?.some((t) => types.includes(t))) throw ApiErrors.restricted();
  });
  const sockets = new RealtimeSockets({
    state,
    db: {} as Db,
    auth: { api: { getSession: opts.getSession ?? (async () => null) } } as never,
    restrictions: { assertNot } as never,
    webOrigins: [ORIGIN],
    sessions: { isActive: async () => true, live: async () => [], ...opts.sessions },
    createPair: () => {
      const server = new FakeWebSocket();
      upgraded.push(server);
      return { client: { client: true }, server };
    },
    upgradeResponse: (client) => Object.assign(new Response(null, { status: 200 }), { client }),
    now: () => clock.t,
  });
  const connect = async (url = "https://x/api/v1/realtime/ws", headers: Record<string, string> = {}) => {
    const res = await sockets.accept(new Request(url, { headers: { upgrade: "websocket", origin: ORIGIN, ...headers } }));
    return { res, ws: upgraded[upgraded.length - 1]! };
  };
  return { sockets, state, connect, upgraded, clock, assertNot };
}

const att = (ws: FakeWebSocket) => ws.deserializeAttachment() as SocketAttachment;
const join = (id?: number, roomId = ROOM) => encodeClientFrame("room:join", { roomId }, id);

describe("RealtimeSockets.accept", () => {
  it("accepts an anonymous socket with an ip tag and an empty attachment", async () => {
    const { connect, state } = setup();
    const { res, ws } = await connect("https://x/api/v1/realtime/ws", { "cf-connecting-ip": "9.9.9.9" });
    expect(res.status).toBe(200);
    expect(att(ws)).toMatchObject({ ip: "9.9.9.9", userId: null, sessionId: null, rooms: [], chats: [] });
    expect(state.getWebSockets("ip:9.9.9.9")).toHaveLength(1);
    expect(state.getWebSockets().length).toBe(1);
  });

  it("rejects a non-upgrade request with 426", async () => {
    const { sockets } = setup();
    expect((await sockets.accept(new Request("https://x/api/v1/realtime/ws"))).status).toBe(426);
  });

  it("rejects a foreign Origin with 403 and accepts a missing one", async () => {
    const { sockets, connect } = setup();
    const res = await sockets.accept(new Request("https://x/ws", { headers: { upgrade: "websocket", origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    const noOrigin = await sockets.accept(new Request("https://x/ws", { headers: { upgrade: "websocket" } }));
    expect(noOrigin.status).toBe(200);
    expect((await connect()).res.status).toBe(200);
  });

  it("caps 20 sockets per IP with 429", async () => {
    const { connect } = setup();
    for (let i = 0; i < 20; i++) expect((await connect("https://x/ws", { "cf-connecting-ip": "5.5.5.5" })).res.status).toBe(200);
    expect((await connect("https://x/ws", { "cf-connecting-ip": "5.5.5.5" })).res.status).toBe(429);
    expect((await connect("https://x/ws", { "cf-connecting-ip": "6.6.6.6" })).res.status).toBe(200);
  });

  it("identifies the user from a live token and tags the socket", async () => {
    const { connect, state } = setup();
    const { token } = signSocketToken("u1", "s1");
    const { ws } = await connect(`https://x/ws?token=${encodeURIComponent(token)}`);
    expect(att(ws)).toMatchObject({ userId: "u1", sessionId: "s1" });
    expect(state.getWebSockets("user:u1")).toHaveLength(1);
  });

  it("falls back to the cookie session when the token's session is gone", async () => {
    const getSession = vi.fn(async () => ({ user: { id: "u7" } }));
    const { connect } = setup({ sessions: { isActive: async () => false }, getSession });
    const { token } = signSocketToken("u1", "s1");
    const { ws } = await connect(`https://x/ws?token=${encodeURIComponent(token)}`, { cookie: "better-auth.session_token=x" });
    expect(att(ws)).toMatchObject({ userId: "u7", sessionId: null });
  });

  it("stays anonymous for a revoked token with no cookie", async () => {
    const { connect, state } = setup({ sessions: { isActive: async () => false } });
    const { token } = signSocketToken("u1", "s1");
    const { ws } = await connect(`https://x/ws?token=${encodeURIComponent(token)}`);
    expect(att(ws).userId).toBeNull();
    expect(state.getWebSockets("user:u1")).toHaveLength(0);
  });
});

describe("RealtimeSockets.onMessage", () => {
  it("acks room:join with joined=true only after the room is in the attachment", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, join(1));
    expect(att(ws).rooms).toEqual([ROOM]);
    expect(ws.frames()).toEqual([{ ack: 1, d: { joined: true } }]);
  });

  it("is idempotent for a room already joined and sends no ack without an id", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, join());
    await sockets.onMessage(ws, join(2));
    expect(att(ws).rooms).toEqual([ROOM]);
    expect(ws.frames()).toEqual([{ ack: 2, d: { joined: true } }]);
  });

  it("acks joined=false for an invalid payload and ignores it without an id", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, join(1, "nope"));
    await sockets.onMessage(ws, join(undefined, "nope"));
    expect(att(ws).rooms).toEqual([]);
    expect(ws.frames()).toEqual([{ ack: 1, d: { joined: false } }]);
  });

  it("refuses a sixth room", async () => {
    const { connect, sockets, clock } = setup();
    const { ws } = await connect();
    for (let i = 0; i < 6; i++) {
      clock.t += 10_000; // keep the event budget out of the way
      await sockets.onMessage(ws, join(i, ROOMS[i]));
    }
    expect(att(ws).rooms).toHaveLength(5);
    expect(ws.frames().at(-1)).toEqual({ ack: 5, d: { joined: false } });
  });

  it("leaves a room", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, join());
    await sockets.onMessage(ws, encodeClientFrame("room:leave", { roomId: ROOM }));
    expect(att(ws).rooms).toEqual([]);
  });

  it("ignores unknown events and malformed frames", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, encodeClientFrame("nope", {}, 1));
    await sockets.onMessage(ws, "not json");
    await sockets.onMessage(ws, "{}");
    expect(ws.sent).toEqual([]);
    expect(ws.closed).toBeNull();
    expect(att(ws).bucket.tokens).toBe(0);
  });

  it("accepts ArrayBuffer frames", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, new TextEncoder().encode(join(1)).buffer as ArrayBuffer);
    expect(att(ws).rooms).toEqual([ROOM]);
  });

  it("closes 1009 on a frame over 4 KB", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, encodeClientFrame("room:join", { roomId: "x".repeat(5000) }));
    expect(ws.closed?.code).toBe(1009);
  });

  it("drops frames over the 10-per-10s budget and closes 4008 after 3 consecutive drops", async () => {
    const { connect, sockets } = setup();
    const { ws } = await connect();
    for (let i = 0; i < 10; i++) await sockets.onMessage(ws, join(i));
    expect(ws.closed).toBeNull();
    await sockets.onMessage(ws, join(100));
    await sockets.onMessage(ws, join(101));
    expect(ws.closed).toBeNull();
    await sockets.onMessage(ws, join(102));
    expect(ws.closed?.code).toBe(4008);
    expect(ws.frames().slice(-3)).toEqual([
      { ack: 100, d: { joined: false } },
      { ack: 101, d: { joined: false } },
      { ack: 102, d: { joined: false } },
    ]);
  });

  it("resets the drop streak after the window rolls over", async () => {
    const { connect, sockets, clock } = setup();
    const { ws } = await connect();
    for (let i = 0; i < 12; i++) await sockets.onMessage(ws, join());
    expect(att(ws).drops).toBe(2);
    clock.t += 10_000;
    await sockets.onMessage(ws, join());
    expect(att(ws).drops).toBe(0);
    expect(ws.closed).toBeNull();
  });
});

describe("RealtimeSockets chat:join", () => {
  const CHAT_ID = "289306e1-e5f2-4cb6-ac63-9ae49e986e04";
  const chatJoin = encodeClientFrame("chat:join", { roomId: CHAT_ID });
  async function authed(blockedTypes: string[] = []) {
    const ctx = setup({ blockedTypes });
    const { token } = signSocketToken("u1", "s1");
    const { ws } = await ctx.connect(`https://x/ws?token=${encodeURIComponent(token)}`);
    return { ...ctx, ws };
  }

  it("joins the chat channel for an unrestricted user, even right after connecting", async () => {
    const { sockets, ws } = await authed();
    await sockets.onMessage(ws, chatJoin);
    expect(att(ws).chats).toEqual([CHAT_ID]);
  });

  it("still joins for a merely chat-muted user", async () => {
    const { sockets, ws } = await authed(["MUTE_CHAT"]);
    await sockets.onMessage(ws, chatJoin);
    expect(att(ws).chats).toEqual([CHAT_ID]);
  });

  it("rejects a banned or suspended user", async () => {
    for (const type of ["BANNED", "SUSPENDED"]) {
      const { sockets, ws } = await authed([type]);
      await sockets.onMessage(ws, chatJoin);
      expect(att(ws).chats).toEqual([]);
    }
  });

  it("rejects an anonymous socket without spending budget", async () => {
    const { sockets, connect } = setup();
    const { ws } = await connect();
    await sockets.onMessage(ws, chatJoin);
    expect(att(ws).chats).toEqual([]);
    expect(att(ws).bucket.tokens).toBe(0);
  });

  it("caches the restriction lookup", async () => {
    const { sockets, ws, assertNot, clock } = await authed();
    await sockets.onMessage(ws, chatJoin);
    clock.t += 1_000;
    await sockets.onMessage(ws, encodeClientFrame("chat:leave", { roomId: CHAT_ID }));
    await sockets.onMessage(ws, chatJoin);
    expect(assertNot).toHaveBeenCalledTimes(1);
    expect(att(ws).chats).toEqual([CHAT_ID]);
  });

  it("leaves a chat channel", async () => {
    const { sockets, ws } = await authed();
    await sockets.onMessage(ws, chatJoin);
    await sockets.onMessage(ws, encodeClientFrame("chat:leave", { roomId: CHAT_ID }));
    expect(att(ws).chats).toEqual([]);
  });
});

describe("RealtimeSockets.sweepSessions", () => {
  it("closes sockets whose session was revoked or expired and keeps the rest", async () => {
    const live = [{ id: "s1-live", userId: "u1" }];
    const { sockets, state } = setup({ sessions: { live: async () => live } });
    const mk = (a: Partial<SocketAttachment>) =>
      state.add(new FakeWebSocket(), [], { ip: "1", userId: null, sessionId: null, rooms: [], chats: [], bucket: { tokens: 0, refilledAt: 0 }, ...a });
    const tokenLive = mk({ userId: "u1", sessionId: "s1-live" });
    const tokenRevoked = mk({ userId: "u1", sessionId: "s1-gone" });
    const cookieLive = mk({ userId: "u1" });
    const cookieNoSession = mk({ userId: "u3" });
    const anonymous = mk({});

    await sockets.sweepSessions();

    expect(tokenLive.closed).toBeNull();
    expect(cookieLive.closed).toBeNull();
    expect(anonymous.closed).toBeNull();
    expect(tokenRevoked.closed).toEqual({ code: 4001, reason: "session-ended" });
    expect(cookieNoSession.closed).toEqual({ code: 4001, reason: "session-ended" });
  });

  it("does not query sessions when no socket is authenticated", async () => {
    const live = vi.fn(async () => []);
    const { sockets, connect } = setup({ sessions: { live } });
    await connect();
    await sockets.sweepSessions();
    expect(live).not.toHaveBeenCalled();
  });
});
