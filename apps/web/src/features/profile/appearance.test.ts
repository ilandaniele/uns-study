import { describe, expect, it } from "vitest";
import { computeAppearance, resolvedName } from "./appearance";

const profile = {
  firstName: "Ana",
  lastName: "Pérez",
  nickname: "Anita",
  customName: null as string | null,
  identityMode: "FULL_NAME" as const,
  alias: "Coipo Ingenioso",
  avatarUrl: "https://example.com/a.jpg" as string | null,
  career: "Ing. en Sistemas" as string | null,
  currentSubject: "Álgebra" as string | null,
  instagram: "ana.p" as string | null,
  studentNumber: "12345" as string | null,
  isAdmin: false,
};
const privacy = {
  showAvatar: true,
  showAdminBadge: true,
  showCareer: false,
  showCurrentSubject: false,
  showInstagram: false,
  showStudentNumber: false,
  showAliasAnimalOnMap: true,
};

describe("resolvedName", () => {
  it("follows each identity mode", () => {
    expect(resolvedName({ ...profile, identityMode: "FIRST_NAME" })).toBe("Ana");
    expect(resolvedName({ ...profile, identityMode: "FIRST_NAME", firstName: " " })).toBe("Anita");
    expect(resolvedName({ ...profile, identityMode: "FULL_NAME" })).toBe("Ana Pérez");
    expect(resolvedName({ ...profile, identityMode: "FULL_NAME", firstName: null, lastName: null })).toBeNull();
    expect(resolvedName({ ...profile, identityMode: "NICKNAME" })).toBe("Anita");
    expect(resolvedName({ ...profile, identityMode: "NICKNAME_AND_NAME" })).toBe("Anita (Ana)");
    expect(resolvedName({ ...profile, identityMode: "NICKNAME_AND_NAME", nickname: null })).toBe("Ana");
    expect(resolvedName({ ...profile, identityMode: "HIDDEN" })).toBeNull();
    expect(resolvedName({ ...profile, identityMode: "NICKNAME", customName: " Ani de Ing " })).toBe("Ani de Ing");
    expect(resolvedName({ ...profile, identityMode: "HIDDEN", customName: "Ani" })).toBeNull();
  });
});

describe("computeAppearance", () => {
  it("distinguishes the owner badge without revealing hidden identities or overriding the toggle", () => {
    const owner = { ...profile, isAdmin: true, isSuperAdmin: true };
    expect(computeAppearance(owner, privacy).adminBadge).toBe("SUPERADMIN");
    expect(computeAppearance(owner, { ...privacy, showAdminBadge: false }).adminBadge).toBe(false);
    expect(computeAppearance({ ...owner, identityMode: "HIDDEN" }, privacy).adminBadge).toBe(false);
    expect(computeAppearance({ ...owner, isAdmin: false }, privacy).adminBadge).toBe(false);
  });
  it("visible: photo, name and only the rows whose toggle is on", () => {
    const result = computeAppearance(profile, { ...privacy, showCareer: true, showInstagram: true });
    expect(result.identityVisible).toBe(true);
    expect(result.name).toBe("Ana Pérez");
    expect(result.avatar).toEqual({ kind: "photo", url: "https://example.com/a.jpg" });
    expect(result.rows).toEqual([
      { label: "Carrera", value: "Ing. en Sistemas" },
      { label: "Instagram", value: "@ana.p" },
    ]);
  });

  it("visible: silhouette without photo permission, badge only for admins who kept it on", () => {
    expect(computeAppearance(profile, { ...privacy, showAvatar: false }).avatar).toEqual({ kind: "silhouette" });
    expect(computeAppearance({ ...profile, isAdmin: true }, privacy).adminBadge).toBe(true);
    expect(computeAppearance({ ...profile, isAdmin: true }, { ...privacy, showAdminBadge: false }).adminBadge).toBe(false);
    expect(computeAppearance(profile, privacy).adminBadge).toBe(false);
  });

  it("hidden: alias animal, no extra info, no badge", () => {
    const result = computeAppearance({ ...profile, identityMode: "HIDDEN", isAdmin: true }, { ...privacy, showCareer: true });
    expect(result.identityVisible).toBe(false);
    expect(result.name).toBe("Coipo Ingenioso");
    expect(result.avatar).toEqual({ kind: "animal", animalId: "coipo" });
    expect(result.rows).toEqual([]);
    expect(result.adminBadge).toBe(false);
  });

  it("hidden with the animal turned off: silhouette and 'Alguien'", () => {
    const result = computeAppearance({ ...profile, identityMode: "HIDDEN" }, { ...privacy, showAliasAnimalOnMap: false });
    expect(result.name).toBe("Alguien");
    expect(result.avatar).toEqual({ kind: "silhouette" });
  });

  it("falls back to hidden when the chosen name fields are empty", () => {
    expect(computeAppearance({ ...profile, identityMode: "NICKNAME", nickname: null }, privacy).identityVisible).toBe(false);
  });
});
