import { describe, expect, it, vi } from "vitest";
import { createResource } from "../resource-cache";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createResource", () => {
  it("dedupes concurrent loads into one request", async () => {
    const d = deferred<number>();
    const fetcher = vi.fn(() => d.promise);
    const r = createResource(fetcher);
    const a = r.load();
    const b = r.load();
    const c = r.refresh();
    d.resolve(7);
    expect(await Promise.all([a, b, c])).toEqual([7, 7, 7]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r.getState()).toEqual({ data: 7, loading: false, error: undefined });
  });

  it("serves the cached value on load but refetches on refresh, keeping the old value meanwhile", async () => {
    let n = 0;
    const d2 = deferred<number>();
    const fetcher = vi.fn(() => (++n === 1 ? Promise.resolve(1) : d2.promise));
    const r = createResource(fetcher);
    await r.load();
    await r.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const p = r.refresh();
    expect(r.getState().data).toBe(1);
    expect(r.getState().loading).toBe(true);
    d2.resolve(2);
    await p;
    expect(r.getState().data).toBe(2);
  });

  it("invalidate clears the value and discards an in-flight result", async () => {
    const stale = deferred<string>();
    let n = 0;
    const fetcher = vi.fn(() => (++n === 1 ? stale.promise : Promise.resolve("fresh")));
    const r = createResource(fetcher);
    const first = r.load();
    r.invalidate();
    expect(r.getState().data).toBeUndefined();
    const second = r.load();
    expect(await second).toBe("fresh");
    stale.resolve("stale");
    await first;
    expect(r.getState().data).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("records errors, rethrows, and allows retry", async () => {
    let n = 0;
    const r = createResource(() => (++n === 1 ? Promise.reject(new Error("boom")) : Promise.resolve("ok")));
    await expect(r.load()).rejects.toThrow("boom");
    expect(r.getState().error).toBeInstanceOf(Error);
    expect(await r.load()).toBe("ok");
    expect(r.getState().error).toBeUndefined();
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const r = createResource(() => Promise.resolve(1));
    const listener = vi.fn();
    const off = r.subscribe(listener);
    await r.load();
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    off();
    r.invalidate();
    expect(listener).not.toHaveBeenCalled();
  });
});
