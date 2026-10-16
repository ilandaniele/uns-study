import { describe, expect, it } from "vitest";
import { csvField, historyCsv } from "./csv";

describe("csvField", () => {
  it("leaves plain values alone", () => {
    expect(csvField("2026-01-15")).toBe("2026-01-15");
    expect(csvField(45)).toBe("45");
  });

  it("quotes and escapes commas, quotes and newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

describe("historyCsv", () => {
  it("writes the header and one row per day", () => {
    const csv = historyCsv([
      { date: "2026-01-14", minutes: 0 },
      { date: "2026-01-15", minutes: 90 },
    ]);
    expect(csv).toBe("date,minutes\r\n2026-01-14,0\r\n2026-01-15,90\r\n");
  });

  it("writes only the header when empty", () => {
    expect(historyCsv([])).toBe("date,minutes\r\n");
  });
});
