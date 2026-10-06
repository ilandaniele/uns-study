import { describe, expect, it } from "vitest";
import type { ConversationDto, GroupConversationDto } from "@sala/contracts";
import { mergeChatRows } from "./chat-rows";

function dm(id: string, lastMessageAt: string | null): ConversationDto {
  return {
    id,
    otherUser: { userId: `u-${id}`, displayName: id, avatarUrl: null },
    lastMessage: null,
    lastMessageAt,
    unread: 0,
  } as ConversationDto;
}

function group(id: string, lastMessageAt: string | null, createdAt: string): GroupConversationDto {
  return { id, name: id, members: [], lastMessage: null, unread: 0, lastMessageAt, createdAt, myRole: "OWNER" };
}

describe("mergeChatRows", () => {
  it("returns an empty list for nothing", () => {
    expect(mergeChatRows([], [])).toEqual([]);
  });

  it("interleaves dms and groups by newest activity", () => {
    const rows = mergeChatRows(
      [dm("d1", "2026-01-02T10:00:00Z"), dm("d2", "2026-01-04T10:00:00Z")],
      [group("g1", "2026-01-03T10:00:00Z", "2026-01-01T00:00:00Z")],
    );
    expect(rows.map((r) => (r.kind === "dm" ? r.conversation.id : r.group.id))).toEqual(["d2", "g1", "d1"]);
  });

  it("sorts an empty group by createdAt and an empty dm last", () => {
    const rows = mergeChatRows([dm("d1", null), dm("d2", "2026-01-02T10:00:00Z")], [group("g1", null, "2026-01-05T00:00:00Z")]);
    expect(rows.map((r) => (r.kind === "dm" ? r.conversation.id : r.group.id))).toEqual(["g1", "d2", "d1"]);
  });

  it("is stable for equal timestamps (dms first, input order kept)", () => {
    const at = "2026-01-02T10:00:00Z";
    const rows = mergeChatRows([dm("d1", at), dm("d2", at)], [group("g1", at, at)]);
    expect(rows.map((r) => (r.kind === "dm" ? r.conversation.id : r.group.id))).toEqual(["d1", "d2", "g1"]);
  });
});
