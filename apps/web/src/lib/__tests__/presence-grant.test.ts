import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationInput } from "@sala/contracts";
import { ApiRequestError } from "../api";
import { clearPresenceGrant, hasPresenceGrant, isGrantLive, setPresenceGrant, withPresence } from "../presence-grant";

const ROOM = "room-1";
const fix: LocationInput = { latitude: -38.7, longitude: -62.27, accuracy: 10, capturedAt: new Date().toISOString() };

function presenceRequired() {
  return new ApiRequestError({ error: { code: "PRESENCE_REQUIRED", message: "Necesitamos tu ubicación." } }, 428);
}

describe("isGrantLive", () => {
  it("is false without a grant and true well before expiry", () => {
    expect(isGrantLive(null, 0)).toBe(false);
    expect(isGrantLive(60 * 60_000, 0)).toBe(true);
  });

  it("stops relying on the grant a minute before it expires", () => {
    expect(isGrantLive(60 * 60_000, 59 * 60_000 + 1)).toBe(false);
  });
});

describe("withPresence", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearPresenceGrant(ROOM);
    fetchMock.mockReset();
    // GET /presence/grant after a located request.
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("samples a fix without a grant, then mirrors the grant the API issued", async () => {
    const locate = vi.fn().mockResolvedValue(fix);
    const send = vi.fn().mockResolvedValue("ok");

    await expect(withPresence(ROOM, locate, send)).resolves.toBe("ok");
    expect(locate).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(fix);
    await vi.waitFor(() => expect(hasPresenceGrant(ROOM)).toBe(true));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/presence/grant?roomId=room-1");
  });

  it("skips geolocation while the grant is live", async () => {
    setPresenceGrant(ROOM, new Date(Date.now() + 30 * 60_000).toISOString());
    const locate = vi.fn().mockResolvedValue(fix);
    const send = vi.fn().mockResolvedValue("ok");

    await withPresence(ROOM, locate, send);
    expect(locate).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(undefined);
  });

  it("falls back to a fix and retries once when the API answers PRESENCE_REQUIRED", async () => {
    setPresenceGrant(ROOM, new Date(Date.now() + 30 * 60_000).toISOString());
    const locate = vi.fn().mockResolvedValue(fix);
    const send = vi.fn().mockRejectedValueOnce(presenceRequired()).mockResolvedValueOnce("ok");

    await expect(withPresence(ROOM, locate, send)).resolves.toBe("ok");
    expect(send).toHaveBeenNthCalledWith(1, undefined);
    expect(send).toHaveBeenNthCalledWith(2, fix);
    expect(locate).toHaveBeenCalledTimes(1);
  });

  it("does not retry other errors", async () => {
    setPresenceGrant(ROOM, new Date(Date.now() + 30 * 60_000).toISOString());
    const locate = vi.fn().mockResolvedValue(fix);
    const taken = new ApiRequestError({ error: { code: "SEAT_TAKEN", message: "El asiento ya está ocupado." } }, 409);
    const send = vi.fn().mockRejectedValue(taken);

    await expect(withPresence(ROOM, locate, send)).rejects.toBe(taken);
    expect(locate).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
