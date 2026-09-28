import { describe, expect, it } from "vitest";
import { base64FromDataUrl, centerSquareCrop } from "./avatar-image";

describe("centerSquareCrop", () => {
  it("centers a square crop within a wider-than-tall image", () => {
    expect(centerSquareCrop(400, 200)).toEqual({ sx: 100, sy: 0, size: 200 });
  });

  it("centers a square crop within a taller-than-wide image", () => {
    expect(centerSquareCrop(200, 500)).toEqual({ sx: 0, sy: 150, size: 200 });
  });

  it("is a no-op crop for an already-square image", () => {
    expect(centerSquareCrop(300, 300)).toEqual({ sx: 0, sy: 0, size: 300 });
  });
});

describe("base64FromDataUrl", () => {
  it("strips the data URL prefix", () => {
    expect(base64FromDataUrl("data:image/jpeg;base64,QUJD")).toBe("QUJD");
  });

  it("returns the input unchanged when there's no comma", () => {
    expect(base64FromDataUrl("QUJD")).toBe("QUJD");
  });
});
