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

describe("avatarRingShadow frames", () => {
  it("draws each frame", () => {
    expect(avatarRingShadow({ proBadge: true, frame: "gold" })).toBe("0 0 0 2px var(--surface), 0 0 0 4px var(--flair-frame-gold)");
    expect(avatarRingShadow({ proBadge: true, frame: "double" })).toBe(
      "0 0 0 2px var(--surface), 0 0 0 4px var(--primary), 0 0 0 6px var(--surface), 0 0 0 8px var(--primary)",
    );
    expect(avatarRingShadow({ proBadge: true, frame: "glow" })).toBe(
      "0 0 0 2px var(--surface), 0 0 0 4px var(--primary), 0 0 12px 4px color-mix(in srgb, var(--primary) 45%, transparent)",
    );
    expect(avatarRingShadow({ proBadge: true, frame: "duo" })).toBe("0 0 0 2px var(--flair-frame-duo-a), 0 0 0 4px var(--flair-frame-duo-b)");
  });

  it("treats none like no frame", () => {
    expect(avatarRingShadow({ proBadge: true, frame: "none" })).toBe(avatarRingShadow({ proBadge: true }));
    expect(avatarRingShadow({ ringColor: "#c9a227", proBadge: true, frame: "none" })).toBe(avatarRingShadow({ ringColor: "#c9a227", proBadge: true }));
  });

  it("ignores the frame without proBadge", () => {
    expect(avatarRingShadow({ frame: "gold" })).toBeUndefined();
    expect(avatarRingShadow({ ringColor: "#c9a227", frame: "duo" })).toBe("0 0 0 3px #c9a227");
  });

  it("pushes the frame outside a medal ring", () => {
    expect(avatarRingShadow({ ringColor: "#c9a227", proBadge: true, frame: "gold" })).toBe(
      "0 0 0 3px #c9a227, 0 0 0 3px var(--surface), 0 0 0 5px var(--flair-frame-gold)",
    );
  });
});
