import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@sala/database";
import { HealthController } from "./health.controller.js";

const dbWith = (execute: () => Promise<unknown>) => ({ execute }) as unknown as Db;

describe("HealthController", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("liveness never touches the database", () => {
    const execute = vi.fn();
    expect(new HealthController(dbWith(execute as never)).get().ok).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("ready returns ok when select 1 succeeds", async () => {
    await expect(new HealthController(dbWith(async () => [{ "?column?": 1 }])).ready()).resolves.toEqual({ ok: true });
  });

  it("ready answers 503 when the query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      new HealthController(
        dbWith(async () => {
          throw new Error("down");
        }),
      ).ready(),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("ready answers 503 when the query hangs past the timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = new HealthController(dbWith(() => new Promise(() => undefined))).ready();
    const assertion = expect(result).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(2_100);
    await assertion;
  });
});
