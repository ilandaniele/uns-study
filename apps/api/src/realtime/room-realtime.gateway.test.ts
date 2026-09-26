import { describe, expect, it } from "vitest";
import type { Auth } from "../auth/auth.instance.js";
import type { Socket } from "socket.io";
import type { RoomStateService } from "../rooms/room-state.service.js";
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
  const gateway = new RoomRealtimeGateway({} as RoomStateService, {} as Auth);

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
