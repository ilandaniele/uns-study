import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("../api", () => ({ apiFetch: (path: string) => apiFetch(path) }));

const { clearQueryCache, fetchCached, peekCached, prefetchPath } = await import("../query-cache");

describe("query-cache", () => {
  beforeEach(() => {
    clearQueryCache();
    apiFetch.mockReset();
  });

  it("shares an in-flight prefetch with the page's own request", async () => {
    apiFetch.mockResolvedValue({ n: 1 });
    prefetchPath("/a");
    await expect(fetchCached("/a")).resolves.toEqual({ n: 1 });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("serves a fresh response without refetching, then revalidates once stale", async () => {
    apiFetch.mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    await fetchCached("/a");
    await expect(fetchCached("/a", 60_000)).resolves.toEqual({ n: 1 });
    await expect(fetchCached("/a", 0)).resolves.toEqual({ n: 2 });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(peekCached("/a")).toEqual({ n: 2 });
  });

  it("drops responses (including in-flight ones) when the identity changes", async () => {
    let resolve!: (v: unknown) => void;
    apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = fetchCached("/me-only");
    clearQueryCache();
    resolve({ secret: true });
    await pending;
    expect(peekCached("/me-only")).toBeUndefined();
  });

  it("keeps the previous value when a revalidation fails", async () => {
    apiFetch.mockResolvedValueOnce({ n: 1 }).mockRejectedValueOnce(new Error("down"));
    await fetchCached("/a");
    await expect(fetchCached("/a")).rejects.toThrow("down");
    expect(peekCached("/a")).toEqual({ n: 1 });
  });
});
