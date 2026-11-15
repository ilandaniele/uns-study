import { describe, expect, it } from "vitest";
import { GUIDES, getGuide } from "./guides";
import { GUIDE_RESOURCES, GUIDE_SCOPE } from "./guide-resources";

describe("guides", () => {
  it("has identified complementary resources for every real guide", () => {
    expect(Object.keys(GUIDE_RESOURCES).sort()).toEqual(GUIDES.map(g => g.slug).sort());
    expect(Object.keys(GUIDE_SCOPE).sort()).toEqual(GUIDES.map(g => g.slug).sort());
    for (const guide of GUIDES) {
      expect(GUIDE_RESOURCES[guide.slug]?.length).toBeGreaterThan(0);
      expect(GUIDE_SCOPE[guide.slug]?.trim()).toBeTruthy();
      for (const resource of GUIDE_RESOURCES[guide.slug] ?? []) {
        expect(resource.title.length).toBeGreaterThan(5);
        expect(new URL(resource.url).protocol).toBe("https:");
        expect(resource.note.trim()).not.toBe("");
      }
    }
  });
  it("has unique kebab-case ascii slugs", () => {
    const slugs = GUIDES.map((guide) => guide.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("has readable sections without an arbitrary word quota", () => {
    for (const guide of GUIDES) {
      expect(guide.sections.length, guide.slug).toBeGreaterThanOrEqual(4);
      expect(guide.sections.length, guide.slug).toBeLessThanOrEqual(7);
      for (const section of guide.sections) {
        expect(section.heading.trim(), guide.slug).not.toBe("");
        expect(section.paragraphs.length, `${guide.slug}: ${section.heading}`).toBeGreaterThan(0);
        for (const paragraph of section.paragraphs) expect(paragraph.trim(), guide.slug).not.toBe("");
      }
    }
  });

  it("has a meta description of a sensible length", () => {
    for (const guide of GUIDES) {
      expect(guide.description.length, guide.slug).toBeGreaterThanOrEqual(120);
      expect(guide.description.length, guide.slug).toBeLessThanOrEqual(170);
    }
  });

  it("has a reading time of at least 3 minutes", () => {
    for (const guide of GUIDES) {
      expect(guide.readingMinutes, guide.slug).toBeGreaterThanOrEqual(3);
    }
  });

  it("looks guides up by slug", () => {
    for (const guide of GUIDES) {
      expect(getGuide(guide.slug)).toBe(guide);
    }
    expect(getGuide("no-existe")).toBeUndefined();
  });
});
