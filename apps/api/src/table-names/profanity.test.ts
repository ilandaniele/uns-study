import { describe, expect, it } from "vitest";
import { containsProfanity } from "./profanity.js";

describe("containsProfanity", () => {
  it("catches a plain blocklisted word", () => {
    expect(containsProfanity("La mesa puta")).toBe(true);
    expect(containsProfanity("mesa de los boludos")).toBe(true);
  });

  it("catches leetspeak substitutions", () => {
    expect(containsProfanity("p3l0tud0")).toBe(true);
    expect(containsProfanity("b0lud@")).toBe(true);
  });

  it("catches accented variants", () => {
    expect(containsProfanity("pÉndeja")).toBe(true);
  });

  it("catches repeated-letter obfuscation", () => {
    expect(containsProfanity("miiiiierda")).toBe(true);
    expect(containsProfanity("puutoo")).toBe(true);
  });

  it("catches hate symbols", () => {
    expect(containsProfanity("mesa nazi")).toBe(true);
    expect(containsProfanity("hitler fan club")).toBe(true);
  });

  it("allows an innocuous name", () => {
    expect(containsProfanity("La Pecera")).toBe(false);
    expect(containsProfanity("Mesa del Fondo")).toBe(false);
  });
});
