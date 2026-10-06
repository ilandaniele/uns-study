import { describe, expect, it } from "vitest";
import { displayName, needsAlias, type DisplayNameProfile } from "./display-name.js";

function profile(overrides: Partial<DisplayNameProfile>): DisplayNameProfile {
  return { firstName: null, lastName: null, nickname: null, identityMode: "HIDDEN", ...overrides };
}

describe("displayName", () => {
  it("returns 'Usuario anónimo' when there is no profile", () => {
    expect(displayName(null, null, "María")).toBe("Usuario anónimo");
  });

  it("returns 'Usuario anónimo' when identityMode is HIDDEN", () => {
    expect(displayName(profile({ identityMode: "HIDDEN", firstName: "María" }), null, "María")).toBe("Usuario anónimo");
  });

  it("FIRST_NAME returns the first name", () => {
    expect(displayName(profile({ identityMode: "FIRST_NAME", firstName: "María" }), null, "x")).toBe("María");
  });

  it("FIRST_NAME falls back to nickname, then 'Usuario anónimo'", () => {
    expect(displayName(profile({ identityMode: "FIRST_NAME", nickname: "Mafe" }), null, "x")).toBe("Mafe");
    expect(displayName(profile({ identityMode: "FIRST_NAME" }), null, "x")).toBe("Usuario anónimo");
  });

  it("FULL_NAME returns 'first last'", () => {
    expect(displayName(profile({ identityMode: "FULL_NAME", firstName: "María", lastName: "Fernández" }), null, "x")).toBe(
      "María Fernández",
    );
  });

  it("NICKNAME returns the nickname", () => {
    expect(displayName(profile({ identityMode: "NICKNAME", nickname: "Mafe" }), null, "x")).toBe("Mafe");
  });

  it("NICKNAME_AND_NAME returns 'nickname (first)'", () => {
    expect(
      displayName(profile({ identityMode: "NICKNAME_AND_NAME", nickname: "Mafe", firstName: "María" }), null, "x"),
    ).toBe("Mafe (María)");
  });

  it("a custom name wins over the mode's name, but never while HIDDEN", () => {
    expect(displayName(profile({ identityMode: "NICKNAME", nickname: "Mafe", customName: "  Mafe de Ing  " }), null, "x")).toBe("Mafe de Ing");
    expect(displayName(profile({ identityMode: "HIDDEN", customName: "Mafe", alias: "Coipo Feliz" }), null, "x")).toBe("Coipo Feliz");
    expect(displayName(profile({ identityMode: "NICKNAME", customName: "   " }), null, "x")).toBe("Usuario anónimo");
    expect(needsAlias(profile({ identityMode: "FULL_NAME", customName: "Mafe" }))).toBe(false);
  });

  it("HIDDEN with an assigned alias returns the alias instead of 'Usuario anónimo'", () => {
    expect(displayName(profile({ identityMode: "HIDDEN", alias: "Carpincho Estudioso" }), null, "x")).toBe("Carpincho Estudioso");
  });

  it("a visible mode with empty chosen fields also falls back to the alias when present", () => {
    expect(displayName(profile({ identityMode: "FIRST_NAME", alias: "Mate Filosófico" }), null, "x")).toBe("Mate Filosófico");
  });

  it("falls back to 'Usuario anónimo' when hidden and no alias was assigned yet", () => {
    expect(displayName(profile({ identityMode: "HIDDEN", alias: null }), null, "x")).toBe("Usuario anónimo");
  });
});
