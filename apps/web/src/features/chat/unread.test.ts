import { describe, expect, it } from "vitest";
import type { ChatMessageDto } from "@sala/contracts";
import { countUnread, formatUnread, sumDmUnread, sumGroupUnread } from "./unread";

function message(overrides: Partial<ChatMessageDto> & { createdAt: string }): ChatMessageDto {
  return {
    id: overrides.createdAt,
    chatRoomId: "room",
    author: { userId: "other", displayName: "Otra", avatarUrl: null },
    content: "hola",
    deleted: false,
    ...overrides,
  };
}

describe("countUnread", () => {
  const messages = [
    message({ createdAt: "2026-10-05T10:00:00.000Z" }),
    message({ createdAt: "2026-10-05T10:05:00.000Z" }),
    message({ createdAt: "2026-10-05T10:06:00.000Z", mine: true }),
    message({ createdAt: "2026-10-05T10:07:00.000Z", author: { userId: "me", displayName: "Yo", avatarUrl: null } }),
    message({ createdAt: "2026-10-05T10:08:00.000Z", deleted: true, content: null }),
    message({ createdAt: "2026-10-05T10:09:00.000Z", author: { userId: null, displayName: "Carpincho", avatarUrl: null } }),
  ];

  it("counts other people's messages after the last seen time", () => {
    expect(countUnread(messages, "2026-10-05T10:01:00.000Z", "me")).toBe(2);
  });

  it("is zero without a last seen time", () => {
    expect(countUnread(messages, null, "me")).toBe(0);
  });

  it("does not count a message posted exactly at the last seen time", () => {
    expect(countUnread(messages, "2026-10-05T10:09:00.000Z", "me")).toBe(0);
  });
});

describe("sumDmUnread", () => {
  const conversations = [
    { id: "a", unread: 2 },
    { id: "b", unread: 3 },
  ];

  it("sums everything without an exclusion", () => {
    expect(sumDmUnread(conversations, null)).toBe(5);
  });

  it("leaves out the excluded conversation", () => {
    expect(sumDmUnread(conversations, "a")).toBe(3);
  });

  it("ignores an exclusion id that is not in the list", () => {
    expect(sumDmUnread(conversations, "zzz")).toBe(5);
  });
});

describe("formatUnread", () => {
  it("caps at 99+", () => {
    expect(formatUnread(7)).toBe("7");
    expect(formatUnread(100)).toBe("99+");
  });
});

describe("sumGroupUnread", () => {
  const groups = [
    { id: "a", unread: 2 },
    { id: "b", unread: 3 },
  ];

  it("sums everything without an exclusion", () => {
    expect(sumGroupUnread(groups, null)).toBe(5);
  });

  it("leaves out the excluded group", () => {
    expect(sumGroupUnread(groups, "a")).toBe(3);
  });

  it("handles an empty list", () => {
    expect(sumGroupUnread([], "a")).toBe(0);
  });
});
