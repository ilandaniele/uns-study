import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiPatch, apiPost, apiPut, CLIENT_VALIDATION_MESSAGE, type BodySchema } from "../api";

const schema: BodySchema = { safeParse: (data) => ({ success: typeof data === "object" && data !== null && "ok" in data }) };

afterEach(() => vi.unstubAllGlobals());

describe("client-side body validation", () => {
  it("throws VALIDATION_ERROR without sending the request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const send of [apiPost, apiPut, apiPatch]) {
      const error = await send("/api/v1/x", { nope: 1 }, schema).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400, message: CLIENT_VALIDATION_MESSAGE });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a valid body with the right method", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ done: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiPut("/api/v1/x", { ok: 1 }, schema)).resolves.toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"ok":1}');
  });

  it("skips validation when no schema is given", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await expect(apiPost("/api/v1/x", { anything: true })).resolves.toEqual({});
  });
});
