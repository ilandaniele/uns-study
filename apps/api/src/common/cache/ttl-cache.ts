interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Tiny in-process TTL cache with single-flight loading. Not shared between processes — only use it
 * for data that is either immutable-ish or invalidated explicitly by the (single) writer, with the
 * TTL as a safety net.
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
  private readonly inflight = new Map<K, Promise<V>>();
  /** Bumped on every invalidation so a load that started before it never repopulates stale data. */
  private generation = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** Returns the cached value or runs `loader` once (concurrent callers share the same promise). Failures are never cached. */
  async wrap(key: K, loader: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const generation = this.generation;
    const promise = loader()
      .then((value) => {
        if (generation === this.generation) this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }

  delete(key: K): void {
    this.entries.delete(key);
    this.inflight.delete(key);
    this.generation++;
  }

  /** Drops every entry whose value matches `predicate`. */
  deleteWhere(predicate: (value: V) => boolean): void {
    for (const [key, entry] of this.entries) if (predicate(entry.value)) this.entries.delete(key);
    this.inflight.clear();
    this.generation++;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.generation++;
  }

  get size(): number {
    return this.entries.size;
  }
}
