import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "./logger.js";

describe("Logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits one JSON line with level, context and message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    new Logger("Ctx").log("hello", { a: 1 });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({ lvl: "log", ctx: "Ctx", msg: "hello", rest: [{ a: 1 }] });
  });

  it("treats the second argument of error() as the stack (Nest convention)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    new Logger("Ctx").error("failed", "stack-text");
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({ lvl: "error", ctx: "Ctx", msg: "failed", stack: "stack-text" });
  });

  it("routes warn to console.warn and survives unserializable input", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    new Logger().warn("w", cyc);
    expect(warn).toHaveBeenCalledOnce();
  });
});
