import { describe, expect, it } from "vitest";
import { locationHelpPlatform, locationHelpSteps } from "./location-help";

describe("location help", () => {
  it("picks the platform from the user agent", () => {
    expect(locationHelpPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile")).toBe("android");
    expect(locationHelpPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0")).toBe("ios");
    expect(locationHelpPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0")).toBe("desktop");
  });

  it("gives every platform steps that end by retrying the check-in", () => {
    for (const platform of ["android", "ios", "desktop"] as const) {
      const steps = locationHelpSteps(platform);
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps.at(-1)).toMatch(/Estoy acá|Permitir/);
    }
  });
});
