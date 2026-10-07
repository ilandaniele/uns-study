import { BadRequestException, ForbiddenException, HttpException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiErrors } from "./api-error.js";
import { ApiExceptionFilter } from "./api-exception.filter.js";

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn((_code: number) => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: "POST", path: "/api/v1/x" }),
    }),
  };
  new ApiExceptionFilter().catch(exception, host as never);
  return { status: status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] as { error: { code: string; message: string } } };
}

describe("ApiExceptionFilter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes ApiException through unchanged", () => {
    const { status, body } = run(ApiErrors.seatTaken());
    expect(status).toBe(409);
    expect(body.error.code).toBe("SEAT_TAKEN");
  });

  it.each([
    [new BadRequestException("bad"), 400, "VALIDATION_ERROR"],
    [new NotFoundException("nope"), 404, "NOT_FOUND"],
    [new ForbiddenException("no"), 403, "FORBIDDEN"],
    [new HttpException("who", 401), 401, "UNAUTHENTICATED"],
    [new HttpException("slow", 429), 429, "RATE_LIMITED"],
    [new HttpException("big", 413), 413, "VALIDATION_ERROR"],
  ])("maps HttpException %# by status", (ex, expectedStatus, code) => {
    const { status, body } = run(ex);
    expect(status).toBe(expectedStatus);
    expect(body.error.code).toBe(code);
  });

  it("maps 5xx HttpExceptions to INTERNAL_ERROR with a generic message and logs them", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status, body } = run(new InternalServerErrorException("db password leaked"));
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: "INTERNAL_ERROR", message: "Error interno." });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ evt: "unhandled_error", method: "POST", path: "/api/v1/x" });
  });

  it("maps unknown errors to INTERNAL_ERROR and logs a JSON line with the stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { status, body } = run(new Error("boom"));
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    const logged = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({ evt: "unhandled_error", msg: "boom" });
    expect(logged.stack).toContain("boom");
  });
});
