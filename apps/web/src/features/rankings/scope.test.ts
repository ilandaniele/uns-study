import type { GroupConversationDto } from "@sala/contracts";
import { describe, expect, it } from "vitest";
import { initialScope, pickDefaultGroup } from "./scope";

function group(id: string, lastMessageAt: string | null, createdAt: string): GroupConversationDto {
  return { id, name: id, members: [], lastMessage: null, unread: 0, lastMessageAt, createdAt, myRole: "MEMBER" } as GroupConversationDto;
}

describe("initialScope", () => {
  const groups = [{ id: "a" }, { id: "b" }];
  it("opens a group the user belongs to", () => {
    expect(initialScope("?group=b", groups)).toEqual({ kind: "group", groupId: "b" });
  });
  it("ignores an unknown group id", () => {
    expect(initialScope("?group=zzz", groups)).toEqual({ kind: "room" });
  });
  it("falls back to the room without a param or without groups", () => {
    expect(initialScope("", groups)).toEqual({ kind: "room" });
    expect(initialScope("?group=a", null)).toEqual({ kind: "room" });
  });
});

describe("pickDefaultGroup", () => {
  it("returns null for an empty list", () => {
    expect(pickDefaultGroup([])).toBeNull();
  });
  it("prefers the most recent activity, falling back to creation time", () => {
    const list = [group("old", "2026-01-01T00:00:00Z", "2025-01-01T00:00:00Z"), group("new", null, "2026-06-01T00:00:00Z")];
    expect(pickDefaultGroup(list)).toBe("new");
  });
  it("keeps the first on ties", () => {
    const list = [group("x", null, "2026-01-01T00:00:00Z"), group("y", null, "2026-01-01T00:00:00Z")];
    expect(pickDefaultGroup(list)).toBe("x");
  });
});
