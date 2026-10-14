import type { Logger } from "../platform/logger.js";

const pending = new Set<Promise<void>>();

/**
 * Runs non-essential work (security events, reputation, ...) after the response path has moved on.
 * Failures are logged, never thrown — the caller must not depend on the outcome.
 */
export function runInBackground(logger: Logger, label: string, task: () => Promise<unknown>): void {
  const promise: Promise<void> = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (err: unknown) => logger.error(`Background task failed: ${label}`, err instanceof Error ? err.stack : String(err)),
    )
    .finally(() => {
      pending.delete(promise);
    });
  pending.add(promise);
}

/** Resolves once every task started with `runInBackground` has settled (tests and graceful shutdown). */
export async function flushBackground(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}

/**
 * Awaits every promise but, if several fail, rethrows the FIRST one in argument order — so running
 * checks concurrently keeps the same error precedence as running them sequentially, and no
 * rejection is left unhandled.
 */
export async function allInOrder<T extends readonly unknown[]>(...promises: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const settled = await Promise.allSettled(promises);
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (failed) throw failed.reason;
  return settled.map((s) => (s as PromiseFulfilledResult<unknown>).value) as unknown as T;
}
