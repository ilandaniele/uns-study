/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once. Plain `Promise.all` fans
 * every item out simultaneously, which doesn't scale once a broadcast (seat-freed, admin-present)
 * reaches hundreds of subscribers/devices at once — this keeps a fixed-size pool of workers
 * instead. No external dependency; order of `results` matches `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
