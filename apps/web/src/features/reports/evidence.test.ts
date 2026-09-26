import { describe, expect, it } from "vitest";
import { describeEvidenceError, validateEvidenceFile } from "./evidence";

describe("validateEvidenceFile", () => {
  it("accepts a small jpeg", () => {
    expect(validateEvidenceFile({ type: "image/jpeg", size: 1024 })).toBeNull();
  });

  it("rejects an unsupported mime type", () => {
    expect(validateEvidenceFile({ type: "application/pdf", size: 1024 })).toBe("UNSUPPORTED_TYPE");
  });

  it("rejects a file over the max size", () => {
    expect(validateEvidenceFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe("TOO_LARGE");
  });

  it("accepts a file exactly at the max size", () => {
    expect(validateEvidenceFile({ type: "image/png", size: 5 * 1024 * 1024 })).toBeNull();
  });
});

describe("describeEvidenceError", () => {
  it("has Spanish copy for each error", () => {
    expect(describeEvidenceError("TOO_LARGE")).toMatch(/tamaño/);
    expect(describeEvidenceError("UNSUPPORTED_TYPE")).toMatch(/Formato/);
  });
});
