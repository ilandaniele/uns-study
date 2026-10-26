import { describe, expect, it } from "vitest";
import { GUIDES, getGuide, type Guide } from "./guides";
import { GUIDE_RESOURCES } from "./guide-resources";

function wordCount(guide: Guide): number {
  const texts = guide.sections.flatMap((section) => [...section.paragraphs, ...(section.list ?? [])]);
  return texts.join(" ").split(/\s+/).filter(Boolean).length;
}

describe("guides", () => {
  it("has identified complementary resources for every real guide", () => {
    expect(Object.keys(GUIDE_RESOURCES).sort()).toEqual(GUIDES.map(g => g.slug).sort());
    for (const guide of GUIDES) {
      expect(GUIDE_RESOURCES[guide.slug]?.length).toBeGreaterThan(0);
      for (const resource of GUIDE_RESOURCES[guide.slug] ?? []) {
        expect(resource.title.length).toBeGreaterThan(5);
        expect(new URL(resource.url).protocol).toBe("https:");
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

  it("has enough content in every guide", () => {
    for (const guide of GUIDES) {
      expect(wordCount(guide), guide.slug).toBeGreaterThanOrEqual(700);
      expect(guide.sections.length, guide.slug).toBeGreaterThanOrEqual(4);
      expect(guide.sections.length, guide.slug).toBeLessThanOrEqual(7);
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
