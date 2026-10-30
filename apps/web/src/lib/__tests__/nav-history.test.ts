import { describe, expect, it } from "vitest";
import { nextNavigationEntry, nextNavigationState, type NavigationEntry } from "../nav-history";

const visit = (path: string, previous: NavigationEntry | null = null) => nextNavigationEntry(path, previous, null, null);

describe("app Back history", () => {
  it("starts direct links without an assumed in-app predecessor", () => {
    expect(visit("/u/test/jardin")).toEqual({ path: "/u/test/jardin", depth: 0, previousPath: null });
  });
  it("restores the profile's original predecessor after returning from its garden", () => {
    const source = visit("/ranking"), profile = visit("/u/test", source), garden = visit("/u/test/jardin", profile);
    const returned = nextNavigationEntry("/u/test", garden, profile, null);
    expect(returned).toEqual(profile);
    expect(returned.previousPath).toBe("/ranking");
    expect(nextNavigationEntry("/ranking", returned, source, null).depth).toBe(0);
  });
  it("replaces a direct-entry garden with its parent without creating a garden/profile loop", () => {
    const garden = visit("/u/test/jardin");
    const profile = nextNavigationEntry("/u/test", garden, null, "/u/test");
    expect(profile.depth).toBe(0);
    expect(profile.previousPath).toBeNull();
    expect(nextNavigationEntry("/personas", profile, null, "/personas")).toEqual(visit("/personas"));
  });
  it("keeps a direct-entry fallback through late hydration of the source page", () => {
    const pending = { from: "/u/test/jardin", to: "/u/test" };
    const lateGarden = nextNavigationState(pending.from, null, null, pending);
    const repeatedGarden = nextNavigationState(pending.from, lateGarden.entry, lateGarden.entry, lateGarden.replacement);
    const profile = nextNavigationState(pending.to, repeatedGarden.entry, repeatedGarden.entry, repeatedGarden.replacement);
    expect(profile.entry).toEqual(visit("/u/test"));
    expect(profile.replacement).toBeNull();
    const people = nextNavigationState("/personas", profile.entry, null, { from: "/u/test", to: "/personas" });
    expect(people.entry).toEqual(visit("/personas"));
    expect(people.replacement).toBeNull();
  });
  it("does not count repeated effects or copied metadata from another pathname as a restored entry", () => {
    const source = visit("/personas"), profile = visit("/u/test", source);
    expect(nextNavigationEntry(profile.path, profile, profile, null)).toEqual(profile);
    expect(nextNavigationEntry("/u/test/jardin", profile, profile, null).depth).toBe(2);
  });
  it("supports forward restoration and a new branch after Back without growing the restored depth", () => {
    const source = visit("/personas"), profile = visit("/u/test", source), garden = visit("/u/test/jardin", profile);
    const back = nextNavigationEntry(profile.path, garden, profile, null);
    expect(nextNavigationEntry(garden.path, back, garden, null)).toEqual(garden);
    expect(visit("/foco", back)).toEqual({ path: "/foco", depth: 2, previousPath: profile.path });
  });
});
