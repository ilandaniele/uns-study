import { describe, expect, it } from "vitest";
import { confirmMessage, countMarkableSeats, durationLabel, markedToastMessage } from "./mark-all-occupied";

describe("mark-all-occupied helpers", () => {
  it("counts every seat that is not OCCUPIED", () => {
    const seats = [{ status: "FREE" }, { status: "UNKNOWN" }, { status: "UNCERTAIN" }, { status: "OCCUPIED" }] as const;
    expect(countMarkableSeats([...seats])).toBe(3);
    expect(countMarkableSeats([])).toBe(0);
  });

  it("labels durations", () => {
    expect(durationLabel(30)).toBe("30 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(240)).toBe("4 h");
  });

  it("pluralizes the toast and confirmation copy", () => {
    expect(markedToastMessage(1)).toBe("Marcamos 1 lugar como ocupado");
    expect(markedToastMessage(12)).toBe("Marcamos 12 lugares como ocupados");
    expect(confirmMessage(1)).toContain("1 lugar libre o sin datos");
    expect(confirmMessage(5)).toContain("5 lugares libres o sin datos");
  });
});
