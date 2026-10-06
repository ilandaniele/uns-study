import { describe, expect, it } from "vitest";
import { parseChatSound } from "./chat-sound";

describe("parseChatSound", () => {
  it("defaults to on", () => {
    expect(parseChatSound(null)).toBe(true);
    expect(parseChatSound("on")).toBe(true);
    expect(parseChatSound("garbage")).toBe(true);
  });

  it("is off only for 'off'", () => {
    expect(parseChatSound("off")).toBe(false);
  });
});
