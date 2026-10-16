import { describe, expect, it } from "vitest";
import { shouldShowDonatePrompt } from "./Donate";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

describe("shouldShowDonatePrompt", () => {
  it("never shows before the visitor has engaged", () => {
    expect(shouldShowDonatePrompt(NOW, 0, false, 0)).toBe(false);
  });

  it("waits two days after a dismissal", () => {
    expect(shouldShowDonatePrompt(NOW, NOW - DAY, true, 0)).toBe(false);
    expect(shouldShowDonatePrompt(NOW, NOW - 2 * DAY, true, 0)).toBe(true);
  });

  it("shows on only some opens once the cooldown is over", () => {
    expect(shouldShowDonatePrompt(NOW, 0, true, 0.1)).toBe(true);
    expect(shouldShowDonatePrompt(NOW, 0, true, 0.9)).toBe(false);
  });
});
