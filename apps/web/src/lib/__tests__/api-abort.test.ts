import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../api";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("does not start a delayed GET retry after its view's signal was aborted", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValue(new TypeError("Synthetic disconnected request"));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const result = apiFetch("/api/v1/rooms/principal/map", { signal: controller.signal });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(1); controller.abort();
  await vi.advanceTimersByTimeAsync(1600); await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});
