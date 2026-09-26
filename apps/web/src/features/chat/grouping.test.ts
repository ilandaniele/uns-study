import { describe, expect, it } from "vitest";
import { formatDaySeparator, formatMessageTime, groupMessages, isGroupedWithPrevious } from "./grouping";

describe("isGroupedWithPrevious", () => {
  it("is false when there is no previous message", () => {
    expect(isGroupedWithPrevious({ id: "1", authorId: "u1", createdAt: "2026-09-25T12:00:00.000Z" }, null)).toBe(false);
  });

  it("is false when the author changes", () => {
    expect(
      isGroupedWithPrevious(
        { id: "2", authorId: "u2", createdAt: "2026-09-25T12:01:00.000Z" },
        { id: "1", authorId: "u1", createdAt: "2026-09-25T12:00:00.000Z" },
      ),
    ).toBe(false);
  });

  it("is true for the same author within the gap window", () => {
    expect(
      isGroupedWithPrevious(
        { id: "2", authorId: "u1", createdAt: "2026-09-25T12:04:00.000Z" },
        { id: "1", authorId: "u1", createdAt: "2026-09-25T12:00:00.000Z" },
      ),
    ).toBe(true);
  });

  it("is false once the gap exceeds the window", () => {
    expect(
      isGroupedWithPrevious(
        { id: "2", authorId: "u1", createdAt: "2026-09-25T12:06:00.000Z" },
        { id: "1", authorId: "u1", createdAt: "2026-09-25T12:00:00.000Z" },
      ),
    ).toBe(false);
  });
});

describe("groupMessages", () => {
  it("marks only same-author messages within the gap as grouped", () => {
    const messages = [
      { id: "1", authorId: "u1", createdAt: "2026-09-25T12:00:00.000Z" },
      { id: "2", authorId: "u1", createdAt: "2026-09-25T12:02:00.000Z" },
      { id: "3", authorId: "u2", createdAt: "2026-09-25T12:03:00.000Z" },
      { id: "4", authorId: "u2", createdAt: "2026-09-25T12:20:00.000Z" },
    ];
    expect(groupMessages(messages).map((m) => m.grouped)).toEqual([false, true, false, false]);
  });
});

describe("formatMessageTime", () => {
  it("pads hours and minutes", () => {
    expect(formatMessageTime(new Date(2026, 8, 25, 9, 5).toISOString())).toBe("09:05");
    expect(formatMessageTime(new Date(2026, 8, 25, 23, 45).toISOString())).toBe("23:45");
  });
});

describe("formatDaySeparator", () => {
  const now = new Date(2026, 8, 25, 18, 0);

  it("returns Hoy for today", () => {
    expect(formatDaySeparator(new Date(2026, 8, 25, 8, 0).toISOString(), now)).toBe("Hoy");
  });

  it("returns Ayer for yesterday", () => {
    expect(formatDaySeparator(new Date(2026, 8, 24, 23, 59).toISOString(), now)).toBe("Ayer");
  });

  it("returns DD/MM/AAAA for older dates", () => {
    expect(formatDaySeparator(new Date(2026, 8, 1, 8, 0).toISOString(), now)).toBe("01/09/2026");
  });
});
