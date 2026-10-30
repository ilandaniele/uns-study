import { describe, expect, it } from "vitest";
import { DESKTOP_NAV, PRIMARY_NAV, isDesktopNavActive, isNavActive } from "../navigation";

describe("navigation sections for public profiles and gardens", () => {
  it.each([
    ["/u/test", "/personas", "/mas"],
    ["/u/test/jardin", "/jardin", "/jardin"],
    ["/u/test/jardin/coleccion", "/jardin", "/jardin"],
    ["/perfil", "/perfil", "/mas"],
    ["/perfil/historial", "/perfil", "/mas"],
    ["/ranking", "/ranking", "/ranking"],
    ["/sala/principal", "/", "/"],
  ])("selects one desktop and one mobile section for %s", (path, desktop, mobile) => {
    expect(DESKTOP_NAV.filter(item => isDesktopNavActive(item.href, path)).map(item => item.href)).toEqual([desktop]);
    expect(PRIMARY_NAV.filter(item => isNavActive(item.href, path)).map(item => item.href)).toEqual([mobile]);
  });
  it("does not match unrelated route names by partial prefix", () => {
    expect(isNavActive("/jardin", "/jardineria")).toBe(false);
    expect(isNavActive("/personas", "/usuario/test")).toBe(false);
  });
});
