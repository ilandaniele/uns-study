import { describe, expect, it, vi } from "vitest";
import type { Auth } from "../auth/auth.instance.js";
import type { Socket, Server } from "socket.io";
import type { RoomStateService } from "../rooms/room-state.service.js";
import type { NotificationService } from "../notifications/notification.service.js";
import { RoomRealtimeGateway, resolveSocketUserId } from "./room-realtime.gateway.js";
import { signSocketToken } from "./socket-token.js";

function mockAuth(getSession: (...args: unknown[]) => Promise<unknown>): Auth {
  return { api: { getSession } } as unknown as Auth;
}

describe("resolveSocketUserId", () => {
  it("returns the user id when the session cookie is valid", async () => {
    const auth = mockAuth(async () => ({ user: { id: "u1" } }));
    await expect(resolveSocketUserId(auth, { headers: { cookie: "session=abc" } })).resolves.toBe("u1");
  });

  it("returns null when there is no session", async () => {
    const auth = mockAuth(async () => null);
    await expect(resolveSocketUserId(auth, { headers: {} })).resolves.toBeNull();
  });

  it("returns null instead of throwing when the auth call fails", async () => {
    const auth = mockAuth(async () => {
      throw new Error("boom");
    });
    await expect(resolveSocketUserId(auth, { headers: {} })).resolves.toBeNull();
  });

  it("resolves the user id from a valid handshake.auth.token, without touching the session cookie", async () => {
    const auth = mockAuth(() => {
      throw new Error("should not be called");
    });
    const { token } = signSocketToken("u2"); // uses the same default (env) secret as the gateway
    await expect(resolveSocketUserId(auth, { headers: {}, auth: { token } })).resolves.toBe("u2");
  });

  it("falls back to the session cookie when the token is invalid", async () => {
    const auth = mockAuth(async () => ({ user: { id: "u3" } }));
    await expect(resolveSocketUserId(auth, { headers: {}, auth: { token: "garbage" } })).resolves.toBe("u3");
  });
});

describe("RoomRealtimeGateway.onJoin", () => {
  const ROOM_ID = "289306e1-e5f2-4cb6-ac63-9ae49e986e04";
  function fakeSocket() {
    const rooms = new Set<string>(["socket-id"]);
    return { id: "socket-id", rooms, join: (r: string) => void rooms.add(r) } as unknown as Socket & { rooms: Set<string> };
  }
  const gateway = new RoomRealtimeGateway({} as RoomStateService, {} as Auth, { handleSeatFreed: async () => [] } as unknown as NotificationService);

  // The client re-fetches the map only after this ack, so the ack must mean "already subscribed".
  it("acks only after the socket has joined the room channel", () => {
    const socket = fakeSocket();
    expect(gateway.onJoin(socket, { roomId: ROOM_ID })).toEqual({ joined: true });
    expect(socket.rooms.has(`room:${ROOM_ID}`)).toBe(true);
  });

  it("acks joined=false for an invalid payload", () => {
    expect(gateway.onJoin(fakeSocket(), { roomId: "nope" })).toEqual({ joined: false });
  });
});

describe("RoomRealtimeGateway.broadcastSeatChanges", () => {
  const ROOM_ID = "289306e1-e5f2-4cb6-ac63-9ae49e986e04";
  const change = (seatId: string) => ({ seatId, status: "FREE" as const, confidence: 0.5, lastUpdatedAt: new Date(), verified: false, previousStatus: "OCCUPIED" as const });

  it("emits seat events immediately, then one coalesced summary + notification pass on flush", async () => {
    const summary = { roomId: ROOM_ID, total: 2, free: 2, occupied: 0, uncertain: 0, saved: 0, unknown: 0 };
    const getRoomSummary = vi.fn(async () => summary);
    const handleSeatFreed = vi.fn(async () => []);
    const gateway = new RoomRealtimeGateway({ getRoomSummary } as unknown as RoomStateService, {} as Auth, { handleSeatFreed } as unknown as NotificationService);
    const emit = vi.fn();
    gateway.server = { to: () => ({ emit }) } as unknown as Server;

    await gateway.broadcastSeatChanges(ROOM_ID, [change("a")]);
    await gateway.broadcastSeatChanges(ROOM_ID, [change("b")]);
    expect(emit.mock.calls.map((c) => c[0])).toEqual(["seat:state-changed", "seat:state-changed"]);
    expect(getRoomSummary).not.toHaveBeenCalled();

    await gateway.flushPending();
    expect(getRoomSummary).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls.map((c) => c[0])).toContain("room:summary-changed");
    expect(handleSeatFreed).toHaveBeenCalledWith(ROOM_ID, [expect.objectContaining({ seatId: "a" }), expect.objectContaining({ seatId: "b" })], summary);
  });
});
