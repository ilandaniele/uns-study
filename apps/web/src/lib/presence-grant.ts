import type { LocationInput, PresenceGrantDto } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "./api";

/**
 * Client mirror of the API's presence grant: after a presence-sensitive action whose GPS fix
 * passed the geofence, the API accepts further actions in that room without coordinates for an
 * hour. While the mirror says the grant is live, actions skip geolocation (and with it the
 * browser's location prompt); the API stays authoritative and answers PRESENCE_REQUIRED when it
 * isn't, in which case the action samples a fix and retries once.
 */

/** Stop relying on the grant this long before the server's expiry (clock skew, request latency). */
const EXPIRY_MARGIN_MS = 60_000;
const STORAGE_PREFIX = "sala:presence-grant:";

const grants = new Map<string, number>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readGrant(roomId: string): number | null {
  const cached = grants.get(roomId);
  if (cached !== undefined) return cached;
  const raw = storage()?.getItem(STORAGE_PREFIX + roomId);
  const until = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(until)) return null;
  grants.set(roomId, until);
  return until;
}

/** Pure check (exported for tests): is a grant ending at `expiresAt` still worth relying on at `now`? */
export function isGrantLive(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && now < expiresAt - EXPIRY_MARGIN_MS;
}

export function hasPresenceGrant(roomId: string, now: number = Date.now()): boolean {
  return isGrantLive(readGrant(roomId), now);
}

export function setPresenceGrant(roomId: string, expiresAt: string | null): void {
  const until = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(until)) {
    clearPresenceGrant(roomId);
    return;
  }
  grants.set(roomId, until);
  try {
    storage()?.setItem(STORAGE_PREFIX + roomId, String(until));
  } catch {
    // Storage full/blocked: the in-memory copy still works for this page.
  }
}

export function clearPresenceGrant(roomId: string): void {
  grants.delete(roomId);
  try {
    storage()?.removeItem(STORAGE_PREFIX + roomId);
  } catch {
    // ignore
  }
}

/** Asks the API until when the caller's grant for `roomId` runs. Best effort: failures leave the mirror as is. */
async function refreshPresenceGrant(roomId: string): Promise<void> {
  try {
    const grant = await apiFetch<PresenceGrantDto>(`/api/v1/presence/grant?roomId=${encodeURIComponent(roomId)}`);
    setPresenceGrant(roomId, grant.expiresAt);
  } catch {
    // Without a known grant the next action just sends a fix.
  }
}

/**
 * Runs a presence-sensitive request. With a live grant for `roomId` it is sent without a location;
 * otherwise (or when the API answers PRESENCE_REQUIRED) a fix is sampled via `locate` and the
 * request is sent with it, after which the grant the API issued (if any) is fetched in the background.
 */
export async function withPresence<T>(
  roomId: string | null | undefined,
  locate: () => Promise<LocationInput>,
  send: (location: LocationInput | undefined) => Promise<T>,
): Promise<T> {
  if (roomId && hasPresenceGrant(roomId)) {
    try {
      return await send(undefined);
    } catch (error) {
      if (!(error instanceof ApiRequestError && error.code === "PRESENCE_REQUIRED")) throw error;
      clearPresenceGrant(roomId);
    }
  }
  const location = await locate();
  try {
    return await send(location);
  } finally {
    // The API may have issued a grant even if a later check failed (e.g. the seat got taken).
    if (roomId) void refreshPresenceGrant(roomId);
  }
}
