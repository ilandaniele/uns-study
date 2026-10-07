import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { runInBackground } from "../common/background.js";
import { drainOnShutdown } from "./realtime.module.js";

describe("drainOnShutdown", () => {
  it("awaits background tasks and the gateway's pending flush", async () => {
    let done = false;
    runInBackground(new Logger("t"), "slow", async () => {
      await new Promise((r) => setTimeout(r, 20));
      done = true;
    });
    const flushPending = vi.fn(async () => undefined);
    await drainOnShutdown({ flushPending });
    expect(done).toBe(true);
    expect(flushPending).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout instead of hanging", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const started = Date.now();
    await drainOnShutdown({ flushPending: () => new Promise<void>(() => undefined) }, 50);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ evt: "shutdown_drain_timeout" });
    spy.mockRestore();
  });
});
