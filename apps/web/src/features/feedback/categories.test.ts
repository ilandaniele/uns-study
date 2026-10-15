import { FEEDBACK_CATEGORIES } from "@sala/contracts";
import { describe, expect, it } from "vitest";
import { feedbackCategoryLabel } from "./categories";

describe("feedbackCategoryLabel", () => {
  it("has a non-empty Spanish label for every category", () => {
    for (const category of FEEDBACK_CATEGORIES) {
      expect(feedbackCategoryLabel(category).length).toBeGreaterThan(0);
    }
  });

  it("maps the known categories", () => {
    expect(feedbackCategoryLabel("SUGGESTION")).toBe("Sugerencia");
    expect(feedbackCategoryLabel("CONCERN")).toBe("Inquietud");
    expect(feedbackCategoryLabel("BUG")).toBe("Problema o error");
    expect(feedbackCategoryLabel("OTHER")).toBe("Otro");
  });
});
