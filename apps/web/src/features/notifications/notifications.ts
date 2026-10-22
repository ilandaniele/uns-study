import type { AnnouncementDto } from "@sala/contracts";

export const SEEN_KEY = "sala.announcements.seen";
export const CACHE_KEY = "sala.announcements.cache";
/** Announcements are fetched at most once per this window (Workers free-tier budget). */
export const CACHE_TTL_MS = 5 * 60_000;

export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export interface AnnouncementsCache {
  fetchedAt: number;
  items: AnnouncementDto[];
}

export function isCacheFresh(cache: AnnouncementsCache | null, now: number): boolean {
  return cache != null && now - cache.fetchedAt >= 0 && now - cache.fetchedAt < CACHE_TTL_MS;
}

export function readSeenIds(store: KeyValueStore | null): Set<string> {
  try {
    const raw = store?.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

/** Adds `ids` to the seen set and persists it. Returns the new set. */
export function markSeen(store: KeyValueStore | null, ids: string[]): Set<string> {
  const seen = readSeenIds(store);
  for (const id of ids) seen.add(id);
  try {
    store?.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Storage unavailable (private mode / quota): the dot just reappears next visit.
  }
  return seen;
}

export function hasUnseen(items: AnnouncementDto[], seen: Set<string>): boolean {
  return items.some((a) => !seen.has(a.id));
}

export function readCache(store: KeyValueStore | null): AnnouncementsCache | null {
  try {
    const raw = store?.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AnnouncementsCache>;
    if (typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.items)) return null;
    return { fetchedAt: parsed.fetchedAt, items: parsed.items };
  } catch {
    return null;
  }
}

export function writeCache(store: KeyValueStore | null, cache: AnnouncementsCache): void {
  try {
    store?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Non-critical.
  }
}
