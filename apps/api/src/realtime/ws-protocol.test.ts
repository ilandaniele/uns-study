import { describe, expect, it } from "vitest";
import { decodeClientFrame, decodeServerFrame, encodeClientFrame, encodeServerAck, encodeServerEvent } from "./ws-protocol.js";

describe("ws-protocol", () => {
  it("round-trips client frames, with and without ack id and data", () => {
    expect(decodeClientFrame(encodeClientFrame("room:join", { roomId: "r" }, 7))).toEqual({ e: "room:join", d: { roomId: "r" }, id: 7 });
    expect(decodeClientFrame(encodeClientFrame("room:leave"))).toEqual({ e: "room:leave" });
  });

  it("rejects malformed client frames", () => {
    for (const raw of ["", "nope", "[]", "null", '{"d":1}', '{"e":1}', '{"e":"x","id":"1"}', '{"e":"x","id":1.5}']) {
      expect(decodeClientFrame(raw)).toBeNull();
    }
  });

  it("decodes server events and acks", () => {
    expect(decodeServerFrame(encodeServerEvent("seat:state-changed", { a: 1 }))).toEqual({ e: "seat:state-changed", d: { a: 1 } });
    expect(decodeServerFrame(encodeServerAck(3, { joined: true }))).toEqual({ ack: 3, d: { joined: true } });
    expect(decodeServerFrame("pong")).toBeNull();
    expect(decodeServerFrame("{}")).toBeNull();
  });
});
