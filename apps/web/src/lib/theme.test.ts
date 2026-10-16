import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "./theme";

function run(stored: Record<string, string>, prefersDark = false) {
  const classes = new Set<string>();
  const dataset: Record<string, string> = {};
  const window = {
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    matchMedia: () => ({ matches: prefersDark }),
  };
  const document = { documentElement: { classList: { add: (c: string) => classes.add(c) }, dataset } };
  new Function("window", "document", THEME_INIT_SCRIPT)(window, document);
  return { classes, dataset };
}

describe("THEME_INIT_SCRIPT", () => {
  it("sets a valid palette", () => {
    expect(run({ "sala-palette": "violeta" }).dataset.palette).toBe("violeta");
  });
  it("ignores an unknown palette", () => {
    expect(run({ "sala-palette": "rosa" }).dataset.palette).toBeUndefined();
    expect(run({ "sala-palette": "default" }).dataset.palette).toBeUndefined();
  });
  it("still applies dark mode", () => {
    expect(run({ "sala-theme": "dark" }).classes.has("dark")).toBe(true);
    expect(run({}).classes.has("dark")).toBe(false);
  });
});
