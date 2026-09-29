import { describe, expect, it } from "vitest";
import { UNS_CAREERS, UNS_DEPARTMENTS, findUnsCareerByName, unsCareersByDepartment } from "./careers";

describe("UNS_CAREERS", () => {
  it("has 67 careers", () => {
    expect(UNS_CAREERS).toHaveLength(67);
  });

  it("has no duplicate ids or names", () => {
    expect(new Set(UNS_CAREERS.map((c) => c.id)).size).toBe(UNS_CAREERS.length);
    expect(new Set(UNS_CAREERS.map((c) => c.name.toLowerCase())).size).toBe(UNS_CAREERS.length);
  });

  it("every entry has a known department and fits the profile length limit", () => {
    for (const career of UNS_CAREERS) {
      expect(UNS_DEPARTMENTS).toContain(career.department);
      expect(career.name.length).toBeGreaterThan(0);
      expect(career.name.length).toBeLessThanOrEqual(120);
      expect(career.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("every department has at least one career", () => {
    for (const group of unsCareersByDepartment()) {
      expect(group.careers.length).toBeGreaterThan(0);
    }
  });

  it("finds careers ignoring case, accents and spacing", () => {
    expect(findUnsCareerByName("ingenieria  en computacion")?.id).toBe("ingenieria-computacion");
    expect(findUnsCareerByName("Abogacía")?.department).toBe("Derecho");
    expect(findUnsCareerByName("Astrología")).toBeUndefined();
    expect(findUnsCareerByName(null)).toBeUndefined();
  });
});
