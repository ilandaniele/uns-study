import { apiFetch } from "./api";

interface Entry {
  data?: unknown;
  /** When `data` was stored (ms epoch). */
  at: number;
  inflight?: Promise<unknown>;
}

/** Oldest cached response `peekCached` will still hand out for an instant first paint. */
const MAX_STALE_MS = 5 * 60_000;
const MAX_ENTRIES = 50;

const entries = new Map<string, Entry>();
let generation = 0;

/**
 * Last response stored for a GET path, for rendering instantly while revalidating
 * (stale-while-revalidate). `undefined` when never fetched or too old.
 */
export function peekCached<T>(path: string): T | undefined {
  const entry = entries.get(path);
  if (!entry || entry.data === undefined || Date.now() - entry.at > MAX_STALE_MS) return undefined;
  return entry.data as T;
}

/**
 * GET through the shared cache. Returns the stored response when younger than `maxAgeMs`,
 * otherwise fetches; concurrent callers (e.g. a prefetch still in flight) share one request.
 */
export function fetchCached<T>(path: string, maxAgeMs = 0): Promise<T> {
  const entry = entries.get(path);
  if (entry?.data !== undefined && Date.now() - entry.at < maxAgeMs) return Promise.resolve(entry.data as T);
  if (entry?.inflight) return entry.inflight as Promise<T>;

  const gen = generation;
  const request = apiFetch<T>(path).then(
    (data) => {
      if (gen === generation) {
        entries.delete(path); // re-insert so the Map's order stays least-recently-stored first
        entries.set(path, { data, at: Date.now() });
        if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
      }
      return data;
    },
    (error: unknown) => {
      const current = entries.get(path);
      if (current?.inflight === request) entries.set(path, { data: current.data, at: current.at });
      throw error;
    },
  );
  entries.set(path, { data: entry?.data, at: entry?.at ?? 0, inflight: request });
  return request;
}

/** Warms the cache for a path unless it already holds a response younger than `maxAgeMs`. */
export function prefetchPath(path: string, maxAgeMs = 30_000): void {
  void fetchCached(path, maxAgeMs).catch(() => undefined);
}

/** Forgets every cached response (the signed-in identity changed; responses are per-user). */
export function clearQueryCache(): void {
  generation += 1;
  entries.clear();
}
