import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiException, ApiErrors, toErrorResponse } from "./api-error.js";

const req = { method: "POST", path: "/api/v1/x" };

describe("ApiException", () => {
  it("exposes status and the Nest-compatible response body", () => {
    const ex = ApiErrors.presenceRejected("OUTSIDE_GEOFENCE" as never, "lejos");
    expect(ex).toBeInstanceOf(Error);
    expect(ex.getStatus()).toBe(403);
    expect(ex.getResponse()).toEqual({ error: { code: "PRESENCE_REJECTED", message: "lejos", reason: "OUTSIDE_GEOFENCE" } });
  });

  it("keeps the canonical messages and statuses", () => {
    expect(ApiErrors.seatTaken().getResponse().error).toEqual({ code: "SEAT_TAKEN", message: "El asiento ya está ocupado." });
    expect(ApiErrors.unauthenticated().getStatus()).toBe(401);
    expect(ApiErrors.presenceRequired().getStatus()).toBe(428);
    expect(ApiErrors.validation().message).toBe("Datos inválidos.");
  });
});

describe("toErrorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes ApiException through unchanged", () => {
    const { status, body } = toErrorResponse(ApiErrors.seatTaken(), req);
    expect(status).toBe(409);
    expect(body.error.code).toBe("SEAT_TAKEN");
  });

  it.each([
    [new HTTPException(400, { message: "bad" }), 400, "VALIDATION_ERROR"],
    [new HTTPException(404, { message: "nope" }), 404, "NOT_FOUND"],
    [new HTTPException(403, { message: "no" }), 403, "FORBIDDEN"],
    [new HTTPException(401, { message: "who" }), 401, "UNAUTHENTICATED"],
    [new HTTPException(429, { message: "slow" }), 429, "RATE_LIMITED"],
    [Object.assign(new Error("big"), { status: 413 }), 413, "VALIDATION_ERROR"],
  ])("maps status errors %# by status", (ex, expectedStatus, code) => {
    const { status, body } = toErrorResponse(ex, req);
    expect(status).toBe(expectedStatus);
    expect(body.error.code).toBe(code);
  });

  it("uses the error message and joins array messages", () => {
    expect(toErrorResponse(new HTTPException(404, { message: "nope" }), req).body.error.message).toBe("nope");
    const arr = Object.assign(new Error("x"), { status: 400, message: ["a", "b"] as unknown as string });
    expect(toErrorResponse(arr, req).body.error.message).toBe("a, b");
  });

  it("maps 5xx status errors to a generic INTERNAL_ERROR and logs them", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status, body } = toErrorResponse(new HTTPException(500, { message: "db password leaked" }), req);
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: "INTERNAL_ERROR", message: "Error interno." });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ evt: "unhandled_error", method: "POST", path: "/api/v1/x" });
  });

  it("maps unknown errors to INTERNAL_ERROR and logs a JSON line with the stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status, body } = toErrorResponse(new Error("boom"), req);
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    const logged = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({ evt: "unhandled_error", msg: "boom" });
    expect(logged.stack).toContain("boom");
  });

  it("is an ApiException instance check, not duck typing", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(new ApiException("SEAT_TAKEN", "m", 409)).toBeInstanceOf(ApiException);
    expect(toErrorResponse({ code: "SEAT_TAKEN" }, req).status).toBe(500);
  });
});
