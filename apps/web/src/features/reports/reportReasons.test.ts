import { describe, expect, it } from "vitest";
import { REPORT_REASONS, reportReasonLabel } from "./reportReasons";

describe("reportReasonLabel", () => {
  it("has a Spanish label for every reason", () => {
    for (const reason of REPORT_REASONS) {
      expect(reportReasonLabel(reason).length).toBeGreaterThan(0);
    }
  });

  it("labels OTHER as Otro", () => {
    expect(reportReasonLabel("OTHER")).toBe("Otro");
  });
});
