import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";

afterEach(() => vi.unstubAllGlobals());

describe("fetchWithTimeout outer signal", () => {
  it("removes the abort listener once the request settles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const outer = new AbortController();
    const add = vi.spyOn(outer.signal, "addEventListener");
    const remove = vi.spyOn(outer.signal, "removeEventListener");
    await apiFetch("/api/v1/x", { signal: outer.signal });
    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    const handler = add.mock.calls[0]![1];
    expect(remove).toHaveBeenCalledWith("abort", handler);
  });

  it("removes the listener when fetch rejects too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const outer = new AbortController();
    const remove = vi.spyOn(outer.signal, "removeEventListener");
    await expect(apiFetch("/api/v1/x", { signal: outer.signal })).rejects.toThrow("boom");
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
