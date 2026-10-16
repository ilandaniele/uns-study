import { describe, expect, it } from "vitest";
import { PRO_BENEFITS, PRO_FEATURES, proLockState } from "./pro";

describe("proLockState", () => {
  it("is unknown while there is no data", () => {
    expect(proLockState(null, true)).toBe("unknown");
    expect(proLockState(null, false)).toBe("unknown");
    expect(proLockState({ pro: true }, true)).toBe("unknown");
  });
  it("unlocks when the server says pro", () => {
    expect(proLockState({ pro: true }, false)).toBe("unlocked");
  });
  it("locks when the server says not pro", () => {
    expect(proLockState({ pro: false }, false)).toBe("locked");
  });
});

describe("pro copy", () => {
  it("describes every feature", () => {
    for (const f of Object.values(PRO_FEATURES)) {
      expect(f.title).not.toBe("");
      expect(f.description).not.toBe("");
    }
    expect(PRO_BENEFITS.length).toBeGreaterThan(0);
  });
  it("lists a benefit for each of the 11 new features", () => {
    const text = PRO_BENEFITS.join(" | ").toLowerCase();
    for (const word of ["avisos de lugar", "historial", "pronóstico", "favoritos", "grupo", "meta semanal", "racha", "temporizador", "exámenes", "sigo acá", "paletas"]) {
      expect(text).toContain(word);
    }
    expect(new Set(PRO_BENEFITS).size).toBe(PRO_BENEFITS.length);
  });
});
