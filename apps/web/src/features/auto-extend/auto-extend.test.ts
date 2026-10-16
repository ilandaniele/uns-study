import { describe, expect, it } from "vitest";
import { parseAutoExtendPrefs, serializeAutoExtendPrefs, shouldAttempt } from "./auto-extend";

const MIN = 60_000;
const now = 1_000_000_000;

describe("shouldAttempt", () => {
  const base = { now, expiresAt: now + 10 * MIN, lastAttemptAt: null, attempts: 0 };

  it.each([
    ["inside the window, first try", base, true],
    ["exactly 15 min left", { ...base, expiresAt: now + 15 * MIN }, true],
    ["16 min left", { ...base, expiresAt: now + 16 * MIN }, false],
    ["already expired", { ...base, expiresAt: now }, false],
    ["expired a while ago", { ...base, expiresAt: now - MIN }, false],
    ["last attempt 4 min ago", { ...base, lastAttemptAt: now - 4 * MIN, attempts: 1 }, false],
    ["last attempt 5 min ago", { ...base, lastAttemptAt: now - 5 * MIN, attempts: 1 }, true],
    ["third attempt still allowed", { ...base, lastAttemptAt: now - 6 * MIN, attempts: 2 }, true],
    ["attempt cap reached", { ...base, lastAttemptAt: now - 6 * MIN, attempts: 3 }, false],
  ])("%s", (_name, input, expected) => {
    expect(shouldAttempt(input)).toBe(expected);
  });
});

describe("auto-extend prefs storage", () => {
  it("parses a stored value", () => {
    expect(parseAutoExtendPrefs('{"enabled":true}')).toEqual({ enabled: true });
    expect(parseAutoExtendPrefs('{"enabled":false}')).toEqual({ enabled: false });
  });

  it.each([null, undefined, "", "nope", "null", "[]", '{"enabled":"yes"}', "{}"])("falls back to off for %j", (raw) => {
    expect(parseAutoExtendPrefs(raw)).toEqual({ enabled: false });
  });

  it("round-trips", () => {
    expect(parseAutoExtendPrefs(serializeAutoExtendPrefs({ enabled: true }))).toEqual({ enabled: true });
  });
});
