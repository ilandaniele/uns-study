import type { RoomMapDto } from "@sala/contracts";

/** Free viewers keep a single device-local favorite; Pro raises it to the contract's 3. */
export const FREE_FAVORITES_MAX = 1;
export const FAVORITE_TOAST_COOLDOWN_MS = 10 * 60_000;

type SeatsOnly = Pick<RoomMapDto, "seats">;

/** Favorites that went from not-free to FREE between two map snapshots (`prev` null = first load, so none). */
export function freedFavorites(prev: SeatsOnly | null, next: SeatsOnly, favoriteSeatIds: readonly string[]): string[] {
  if (!prev || favoriteSeatIds.length === 0) return [];
  const before = new Map(prev.seats.map((seat) => [seat.id, seat.status]));
  const nowFree = new Set(next.seats.filter((seat) => seat.status === "FREE").map((seat) => seat.id));
  return favoriteSeatIds.filter((id) => {
    const was = before.get(id);
    return was !== undefined && was !== "FREE" && nowFree.has(id);
  });
}

/** Of `seatIds`, the ones not already announced within the cooldown (`lastShown` maps seat id to epoch ms). */
export function dueFavoriteToasts(seatIds: readonly string[], lastShown: ReadonlyMap<string, number>, now: number, cooldownMs = FAVORITE_TOAST_COOLDOWN_MS): string[] {
  return seatIds.filter((id) => now - (lastShown.get(id) ?? -Infinity) >= cooldownMs);
}

/** Whether to push the device-local favorite to the server: only once, and only into an empty list. */
export function shouldMigrate(serverIds: readonly string[], local: string | null, migratedFlag: string | null): boolean {
  return serverIds.length === 0 && !!local && !migratedFlag;
}

/** Adds or removes `seatId`. `full` is true when adding was refused because `max` was reached. */
export function toggleFavoriteIds(ids: readonly string[], seatId: string, max: number): { ids: string[]; full: boolean } {
  if (ids.includes(seatId)) return { ids: ids.filter((id) => id !== seatId), full: false };
  if (ids.length >= max) return { ids: [...ids], full: true };
  return { ids: [...ids, seatId], full: false };
}
