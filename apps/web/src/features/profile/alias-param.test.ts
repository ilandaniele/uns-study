import { describe, expect, it } from "vitest";
import { aliasFromParam } from "./alias-param";

describe("alias route parameters", () => {
  it("normalizes encoded spaces and accents before building the API URL", () => {
    expect(aliasFromParam("Hormiga%20Creativa")).toBe("Hormiga Creativa");
    expect(aliasFromParam("Tortuga%20Risue%C3%B1a")).toBe("Tortuga Risueña");
    expect(encodeURIComponent(aliasFromParam("Hormiga%20Creativa"))).toBe("Hormiga%20Creativa");
  });
  it("accepts already decoded parameters and leaves malformed escapes for the server to reject", () => {
    expect(aliasFromParam("Tortuga Risueña")).toBe("Tortuga Risueña");
    expect(aliasFromParam("%incorrecto")).toBe("%incorrecto");
  });
});
