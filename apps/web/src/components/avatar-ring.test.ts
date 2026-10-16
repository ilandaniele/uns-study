import { describe, expect, it } from "vitest";
import { PRO_RING_COLOR, avatarRingShadow } from "./avatar-ring";

describe("avatarRingShadow", () => {
  it("is undefined without a ring or Pro badge", () => {
    expect(avatarRingShadow({})).toBeUndefined();
    expect(avatarRingShadow({ proBadge: false })).toBeUndefined();
  });

  it("keeps the medal ring as it was", () => {
    expect(avatarRingShadow({ ringColor: "#c9a227" })).toBe("0 0 0 3px #c9a227");
  });

  it("draws the Pro ring with a gap", () => {
    expect(avatarRingShadow({ proBadge: true })).toBe(`0 0 0 2px var(--surface), 0 0 0 4px ${PRO_RING_COLOR}`);
  });

  it("combines a medal with the Pro ring outside it", () => {
    expect(avatarRingShadow({ ringColor: "#c9a227", proBadge: true })).toBe(`0 0 0 3px #c9a227, 0 0 0 5px ${PRO_RING_COLOR}`);
  });
});
