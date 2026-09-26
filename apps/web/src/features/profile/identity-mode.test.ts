import { describe, expect, it } from "vitest";
import { IDENTITY_MODES, identityModeHint, identityModeLabel } from "./identity-mode";

describe("identityModeLabel", () => {
  it("returns a distinct Spanish label for every mode", () => {
    const labels = IDENTITY_MODES.map(identityModeLabel);
    expect(new Set(labels).size).toBe(IDENTITY_MODES.length);
  });

  it("labels HIDDEN as the private default", () => {
    expect(identityModeLabel("HIDDEN")).toMatch(/oculto/i);
  });
});

describe("identityModeHint", () => {
  it("warns that hidden mode shows no name at all", () => {
    expect(identityModeHint("HIDDEN")).toMatch(/sin ningún nombre/i);
  });

  it("gives the generic hint for visible modes", () => {
    expect(identityModeHint("FULL_NAME")).toMatch(/verán otras personas/i);
  });
});
