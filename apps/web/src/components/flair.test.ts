import { NAME_COLORS, PROFILE_FRAMES } from "@sala/contracts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRAME_META, NAME_COLOR_META, frameOf, nameColorStyle } from "./flair";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

describe("flair", () => {
  it("has no style for default or absent flair", () => {
    expect(nameColorStyle(undefined)).toBeUndefined();
    expect(nameColorStyle(null)).toBeUndefined();
    expect(nameColorStyle({ frame: "gold", nameColor: "default" })).toBeUndefined();
  });

  it("maps a color to its CSS variable", () => {
    expect(nameColorStyle({ frame: "none", nameColor: "ocean" })).toEqual({ color: "var(--flair-name-ocean)" });
  });

  it("reads the frame", () => {
    expect(frameOf(undefined)).toBeUndefined();
    expect(frameOf({ frame: "duo", nameColor: "default" })).toBe("duo");
  });

  it("labels every id", () => {
    for (const id of PROFILE_FRAMES) expect(FRAME_META[id].label).toBeTruthy();
    for (const id of NAME_COLORS) expect(NAME_COLOR_META[id].label).toBeTruthy();
  });

  it("defines every non-default color in light and dark", () => {
    for (const id of NAME_COLORS.filter((c) => c !== "default")) {
      expect(css.split(`--flair-name-${id}:`).length - 1, id).toBe(2);
    }
    for (const name of ["--flair-frame-gold", "--flair-frame-duo-a", "--flair-frame-duo-b"]) {
      expect(css.split(`${name}:`).length - 1, name).toBe(2);
    }
  });
});
