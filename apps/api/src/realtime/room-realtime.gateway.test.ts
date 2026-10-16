import { describe, expect, it, vi } from "vitest";
import type { Auth } from "../auth/auth.instance.js";
import { ManualScheduler } from "../platform/scheduler.js";
import { RecordingHub } from "./realtime-hub.js";
import { RoomRealtimeGateway, resolveSocketUserId, summaryJobKey } from "./room-realtime.gateway.js";
import { signSocketToken } from "./socket-token.js";

const liveSession = async (): Promise<boolean> => true;

function mockAuth(getSession: (...args: unknown[]) => Promise<unknown>): Pick<Auth, "api"> {
  return { api: { getSession } } as unknown as Pick<Auth, "api">;
}

describe("resolveSocketUserId", () => {
  it("returns the user id when the session cookie is valid", async () => {
    const getSession = vi.fn(async (..._args: unknown[]) => ({ user: { id: "u1" } }));
    await expect(resolveSocketUserId(null, "session=abc", { auth: mockAuth(getSession), isSessionActive: liveSession })).resolves.toBe("u1");
    const arg = getSession.mock.calls[0]![0] as { headers: Headers };
    expect(arg.headers.get("cookie")).toBe("session=abc");
  });

  it("returns null when there is no session", async () => {
    const auth = mockAuth(async () => null);
    await expect(resolveSocketUserId(null, null, { auth, isSessionActive: liveSession })).resolves.toBeNull();
  });

  it("returns null instead of throwing when the auth call fails", async () => {
    const auth = mockAuth(async () => {
      throw new Error("boom");
    });
    await expect(resolveSocketUserId(null, null, { auth, isSessionActive: liveSession })).resolves.toBeNull();
  });

  it("resolves the user id from a valid token, without touching the session cookie", async () => {
    const auth = mockAuth(() => {
      throw new Error("should not be called");
    });
    const { token } = signSocketToken("u2", "s2"); // uses the same default (env) secret as the gateway
    const isActive = vi.fn(liveSession);
    await expect(resolveSocketUserId(token, null, { auth, isSessionActive: isActive })).resolves.toBe("u2");
    expect(isActive).toHaveBeenCalledWith({ userId: "u2", sessionId: "s2" });
  });

  it("refuses a valid token whose session is gone (signed out) and falls back to the cookie", async () => {
    const auth = mockAuth(async () => null);
    const { token } = signSocketToken("u2", "s2");
    await expect(resolveSocketUserId(token, null, { auth, isSessionActive: async () => false })).resolves.toBeNull();
  });

  it("treats a failing session lookup as inactive", async () => {
    const auth = mockAuth(async () => null);
    const { token } = signSocketToken("u2", "s2");
    const failing = async (): Promise<boolean> => {
      throw new Error("db down");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(resolveSocketUserId(token, null, { auth, isSessionActive: failing })).resolves.toBeNull();
    spy.mockRestore();
  });

  it("falls back to the session cookie when the token is invalid", async () => {
    const auth = mockAuth(async () => ({ user: { id: "u3" } }));
    await expect(resolveSocketUserId("garbage", null, { auth, isSessionActive: liveSession })).resolves.toBe("u3");
  });

  it("logs a failing token session check instead of swallowing it silently", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { token } = signSocketToken("u2", "s2");
    await resolveSocketUserId(token, null, {
      auth: mockAuth(async () => null),
      isSessionActive: async () => {
        throw new Error("db down");
      },
    });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ evt: "socket_session_check_error", msg: "db down" });
    spy.mockRestore();
  });
});

describe("RoomRealtimeGateway.broadcastSeatChanges", () => {
  const ROOM_ID = "289306e1-e5f2-4cb6-ac63-9ae49e986e04";
  const change = (seatId: string) => ({ seatId, status: "FREE" as const, confidence: 0.5, lastUpdatedAt: new Date(), verified: false, previousStatus: "OCCUPIED" as const });
  const summary = { roomId: ROOM_ID, total: 2, free: 2, occupied: 0, uncertain: 0, saved: 0, unknown: 0 };

  function build(scheduler: ManualScheduler | null) {
    const hub = new RecordingHub();
    const getRoomSummary = vi.fn(async () => summary);
    const handleSeatFreed = vi.fn(async () => [{ userId: "u9", seatIds: ["a"] }]);
    const gateway = new RoomRealtimeGateway(hub, { getRoomSummary }, { handleSeatFreed } as never, scheduler);
    return { hub, gateway, getRoomSummary, handleSeatFreed };
  }

  it("emits seat events immediately, then one coalesced summary + notification pass on flush", async () => {
    const { hub, gateway, getRoomSummary, handleSeatFreed } = build(null);

    await gateway.broadcastSeatChanges(ROOM_ID, [change("a")]);
    await gateway.broadcastSeatChanges(ROOM_ID, [change("b")]);
    expect(hub.sent.map((s) => s.event)).toEqual(["seat:state-changed", "seat:state-changed"]);
    expect(hub.sent.every((s) => s.to === `room:${ROOM_ID}`)).toBe(true);
    expect(getRoomSummary).not.toHaveBeenCalled();

    await gateway.flushPending();
    expect(getRoomSummary).toHaveBeenCalledTimes(1);
    expect(hub.eventsFor("room:summary-changed")).toEqual([{ to: `room:${ROOM_ID}`, event: "room:summary-changed", payload: summary }]);
    expect(hub.eventsFor("seat:freed-alert")).toEqual([{ to: "user:u9", event: "seat:freed-alert", payload: { seatIds: ["a"], freeCount: 2 } }]);
    expect(handleSeatFreed).toHaveBeenCalledWith(ROOM_ID, [expect.objectContaining({ seatId: "a" }), expect.objectContaining({ seatId: "b" })], summary);
  });

  it("defers the flush to a single summary:<roomId> job when a scheduler is given", async () => {
    const scheduler = new ManualScheduler();
    const { hub, gateway, getRoomSummary } = build(scheduler);
    const flushed: string[] = [];
    scheduler.register("summary", async ({ key }) => {
      flushed.push(key);
      await gateway.flushRoom(key.slice("summary:".length));
    });

    await gateway.broadcastSeatChanges(ROOM_ID, [change("a")]);
    await gateway.broadcastSeatChanges(ROOM_ID, [change("b")]);
    expect(scheduler.has(summaryJobKey(ROOM_ID))).toBe(true);
    expect(getRoomSummary).not.toHaveBeenCalled();

    await scheduler.runDue(new Date(Date.now() + 1_000));
    expect(flushed).toEqual([`summary:${ROOM_ID}`]);
    expect(getRoomSummary).toHaveBeenCalledTimes(1);
    expect(hub.eventsFor("room:summary-changed")).toHaveLength(1);
  });

  it("flushRoom is a no-op when nothing is pending (e.g. the DO restarted)", async () => {
    const { hub, gateway, getRoomSummary } = build(null);
    await gateway.flushRoom(ROOM_ID);
    expect(getRoomSummary).not.toHaveBeenCalled();
    expect(hub.sent).toEqual([]);
  });

  it("still emits the summary when seat-freed notifications fail", async () => {
    const hub = new RecordingHub();
    const gateway = new RoomRealtimeGateway(
      hub,
      { getRoomSummary: async () => summary },
      {
        handleSeatFreed: async () => {
          throw new Error("push down");
        },
      } as never,
      null,
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await gateway.broadcastSeatChanges(ROOM_ID, [change("a")]);
    await gateway.flushPending();
    spy.mockRestore();
    expect(hub.eventsFor("room:summary-changed")).toHaveLength(1);
  });
});

describe("RoomRealtimeGateway quiet-room alerts", () => {
  const ROOM_ID = "289306e1-e5f2-4cb6-ac63-9ae49e986e04";
  const change = { seatId: "a", status: "FREE" as const, confidence: 0.5, lastUpdatedAt: new Date(), verified: false, previousStatus: "OCCUPIED" as const };
  const summary = { roomId: ROOM_ID, total: 100, free: 60, occupied: 40, uncertain: 0, saved: 0, unknown: 0 };

  it("publishes room:quiet-alert to each recipient", async () => {
    const hub = new RecordingHub();
    const event = { roomId: ROOM_ID, roomSlug: "principal", thresholdPct: 50, occupancyPct: 40, free: 60 };
    const handleQuietRoom = vi.fn(async () => [{ userId: "u7", event }]);
    const gateway = new RoomRealtimeGateway(hub, { getRoomSummary: async () => summary }, { handleSeatFreed: async () => [], handleQuietRoom } as never, null);
    await gateway.broadcastSeatChanges(ROOM_ID, [change]);
    await gateway.flushPending();
    expect(handleQuietRoom).toHaveBeenCalledWith(ROOM_ID, summary, [expect.objectContaining({ seatId: "a" })]);
    expect(hub.eventsFor("room:quiet-alert")).toEqual([{ to: "user:u7", event: "room:quiet-alert", payload: event }]);
  });

  it("still emits the summary when quiet-room processing throws", async () => {
    const hub = new RecordingHub();
    const gateway = new RoomRealtimeGateway(
      hub,
      { getRoomSummary: async () => summary },
      {
        handleSeatFreed: async () => [],
        handleQuietRoom: async () => {
          throw new Error("boom");
        },
      } as never,
      null,
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await gateway.broadcastSeatChanges(ROOM_ID, [change]);
    await gateway.flushPending();
    spy.mockRestore();
    expect(hub.eventsFor("room:summary-changed")).toHaveLength(1);
    expect(hub.eventsFor("room:quiet-alert")).toHaveLength(0);
  });
});

describe("RoomRealtimeGateway emitters", () => {
  const hub = new RecordingHub();
  const gateway = new RoomRealtimeGateway(hub, { getRoomSummary: async () => ({}) as never }, { handleSeatFreed: async () => [] } as never, null);

  it("routes each event to the right channel", () => {
    gateway.emitDailyReset("r1");
    gateway.emitChatMessage("c1", { id: "m" } as never);
    gateway.emitChatDeleted("c1", "m1");
    gateway.emitDm(["a", "b"], { id: "d" } as never);
    gateway.emitDisputeChallenge("inc", {} as never);
    gateway.emitCheckInExpiring("u1", {} as never);
    expect(hub.sent.map((s) => [s.to, s.event])).toEqual([
      ["room:r1", "room:daily-reset"],
      ["chat:c1", "chat:message-created"],
      ["chat:c1", "chat:message-deleted"],
      ["user:a", "dm:message-created"],
      ["user:b", "dm:message-created"],
      ["user:inc", "dispute:you-are-challenged"],
      ["user:u1", "checkin:expiring"],
    ]);
    expect(hub.sent[0]!.payload).toEqual({ roomId: "r1" });
  });

  it("disconnectUser closes through the hub", () => {
    gateway.disconnectUser("u1");
    expect(hub.disconnects).toEqual([{ userId: "u1", code: 4001, reason: "session-ended" }]);
  });
});
