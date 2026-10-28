import { describe, expect, it } from "vitest";
import { parseFocusData } from "./focus-store";

// A save written by the first storage format, before layers and custom presets existed.
const OLD_V1 = JSON.stringify({
  settings: { focusMin: 40, shortMin: 8, longMin: 20, rounds: 3, autoStartBreaks: false, autoStartFocus: true },
  timer: { phase: "short", completedInSet: 1, status: "paused", endsAt: null, remainingMs: 120000 },
  stats: { days: { "2026-10-01": { sessions: 2, minutes: 80 } } },
  tasks: [{ id: "a", text: "Estudiar", done: false, pomodoros: 2 }],
  activeTaskId: "a",
  ambient: "ocean",
  volume: 0.8,
  chime: false,
});

describe("parseFocusData", () => {
  it("keeps old history imports bounded and ignores malformed day values",()=>{
    const days:Record<string,unknown>={bad:{sessions:9,minutes:9},"2026-10-28":{sessions:"invalid",minutes:25}};
    for(let i=0;i<121;i++)days[new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10)]={sessions:1,minutes:25};
    const parsed=parseFocusData(JSON.stringify({stats:{days}}));
    expect(Object.keys(parsed.stats.days).length).toBeLessThanOrEqual(120);
    expect(parsed.stats.days.bad).toBeUndefined();expect(parsed.stats.days["2026-10-28"]).toBeUndefined();
  });
  it("migrates an old v1 save without losing anything", () => {
    const d = parseFocusData(OLD_V1);
    expect(d.layers).toEqual([{ kind: "ocean", volume: 1 }]);
    expect(d.volume).toBe(0.8);
    expect(d.customPresets).toEqual([]);
    expect(d.settings).toMatchObject({ focusMin: 40, shortMin: 8, longMin: 20, rounds: 3, autoStartFocus: true });
    expect(d.timer).toMatchObject({ phase: "short", status: "paused", remainingMs: 120000 });
    expect(d.stats.days["2026-10-01"]).toEqual({ sessions: 2, minutes: 80 });
    expect(d.tasks).toHaveLength(1);
    expect(d.activeTaskId).toBe("a");
    expect(d.chime).toBe(false);
  });

  it("an old save with ambient off has no layers; retired white/pink keep their kind", () => {
    expect(parseFocusData(JSON.stringify({ ambient: "off" })).layers).toEqual([]);
    expect(parseFocusData(JSON.stringify({ ambient: "white" })).layers).toEqual([{ kind: "white", volume: 1 }]);
  });

  it("round-trips the new format", () => {
    const d = parseFocusData(
      JSON.stringify({
        layers: [{ kind: "cafe", volume: 0.4 }, { kind: "rain", volume: 0.7 }],
        customPresets: [{ id: "x", name: "Tarde", focusMin: 50, shortMin: 10 }],
      }),
    );
    expect(d.layers).toEqual([{ kind: "cafe", volume: 0.4 }, { kind: "rain", volume: 0.7 }]);
    expect(d.customPresets).toEqual([{ id: "x", name: "Tarde", focusMin: 50, shortMin: 10 }]);
  });

  it("falls back to defaults on garbage", () => {
    expect(parseFocusData("{nope").layers).toEqual([]);
    expect(parseFocusData(null).customPresets).toEqual([]);
  });
});
