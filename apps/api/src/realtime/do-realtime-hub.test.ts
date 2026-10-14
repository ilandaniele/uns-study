import { describe, expect, it } from "vitest";
import { DoRealtimeHub } from "./do-realtime-hub.js";
import { FakeSocketState, FakeWebSocket } from "./fake-socket-state.js";
import type { SocketAttachment } from "./ws-server.js";

const att = (over: Partial<SocketAttachment> = {}): SocketAttachment => ({
  ip: "1.1.1.1",
  userId: null,
  sessionId: null,
  rooms: [],
  chats: [],
  bucket: { tokens: 0, refilledAt: 0 },
  ...over,
});

function setup() {
  const state = new FakeSocketState();
  const inRoom = state.add(new FakeWebSocket(), ["ip:1"], att({ rooms: ["r1"] }));
  const inOther = state.add(new FakeWebSocket(), ["ip:1"], att({ rooms: ["r2"] }));
  const chatter = state.add(new FakeWebSocket(), ["ip:2", "user:u1"], att({ userId: "u1", chats: ["c1"] }));
  const userTwo = state.add(new FakeWebSocket(), ["ip:3", "user:u2"], att({ userId: "u2", rooms: ["r1"] }));
  return { hub: new DoRealtimeHub(state), inRoom, inOther, chatter, userTwo };
}

describe("DoRealtimeHub", () => {
  it("publishes to room members only, as {e,d} frames", () => {
    const { hub, inRoom, inOther, chatter, userTwo } = setup();
    hub.publishToRoom("r1", "seat:state-changed", { seatId: "s" });
    expect(inRoom.frames()).toEqual([{ e: "seat:state-changed", d: { seatId: "s" } }]);
    expect(userTwo.frames()).toHaveLength(1);
    expect(inOther.sent).toHaveLength(0);
    expect(chatter.sent).toHaveLength(0);
  });

  it("publishes to chat members only", () => {
    const { hub, chatter, inRoom } = setup();
    hub.publishToChat("c1", "chat:message-created", { id: 1 });
    expect(chatter.sent).toHaveLength(1);
    expect(inRoom.sent).toHaveLength(0);
  });

  it("publishes to a user through the user tag", () => {
    const { hub, chatter, userTwo } = setup();
    hub.publishToUser("u1", "dm:message-created", {});
    expect(chatter.sent).toHaveLength(1);
    expect(userTwo.sent).toHaveLength(0);
  });

  it("broadcasts to every socket", () => {
    const { hub, inRoom, inOther, chatter, userTwo } = setup();
    hub.broadcast("x", {});
    for (const ws of [inRoom, inOther, chatter, userTwo]) expect(ws.sent).toHaveLength(1);
  });

  it("closes a user's sockets with 4001 by default", () => {
    const { hub, chatter, userTwo } = setup();
    hub.disconnectUser("u1");
    expect(chatter.closed).toEqual({ code: 4001, reason: "session-ended" });
    expect(userTwo.closed).toBeNull();
  });

  it("skips a socket whose send throws and keeps delivering to the rest", () => {
    const { hub, inRoom, userTwo } = setup();
    inRoom.send = () => {
      throw new Error("boom");
    };
    hub.publishToRoom("r1", "e", {});
    expect(userTwo.sent).toHaveLength(1);
  });
});
