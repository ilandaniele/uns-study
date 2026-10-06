import { describe, expect, it } from "vitest";
import { conversationIdFromPath, DM_SOUND_COOLDOWN_MS, shouldPlayDmSound, type DmNotifyInput } from "./dm-notify";

const base: DmNotifyInput = {
  message: { senderId: "other", conversationId: "c1" },
  currentUserId: "me",
  soundEnabled: true,
  viewingConversationId: null,
  documentVisible: true,
  lastPlayedAt: null,
  now: 10_000,
};

describe("shouldPlayDmSound", () => {
  it("plays for a message from someone else", () => {
    expect(shouldPlayDmSound(base)).toBe(true);
  });

  it("is silent for your own message", () => {
    expect(shouldPlayDmSound({ ...base, message: { senderId: "me", conversationId: "c1" } })).toBe(false);
  });

  it("is silent when muted", () => {
    expect(shouldPlayDmSound({ ...base, soundEnabled: false })).toBe(false);
  });

  it("is silent when that conversation is visibly on screen", () => {
    expect(shouldPlayDmSound({ ...base, viewingConversationId: "c1" })).toBe(false);
  });

  it("plays when that conversation is open but the tab is hidden", () => {
    expect(shouldPlayDmSound({ ...base, viewingConversationId: "c1", documentVisible: false })).toBe(true);
  });

  it("plays when another conversation is open", () => {
    expect(shouldPlayDmSound({ ...base, viewingConversationId: "c2" })).toBe(true);
  });

  it("respects the cooldown boundary", () => {
    expect(shouldPlayDmSound({ ...base, lastPlayedAt: base.now - (DM_SOUND_COOLDOWN_MS - 1) })).toBe(false);
    expect(shouldPlayDmSound({ ...base, lastPlayedAt: base.now - DM_SOUND_COOLDOWN_MS })).toBe(true);
  });
});

describe("conversationIdFromPath", () => {
  it("extracts the id", () => {
    expect(conversationIdFromPath("/chat/dm/abc")).toBe("abc");
    expect(conversationIdFromPath("/chat/dm/abc/")).toBe("abc");
    expect(conversationIdFromPath("/chat/dm/abc?x=1")).toBe("abc");
  });

  it("returns null for anything else", () => {
    expect(conversationIdFromPath("/chat/dm")).toBeNull();
    expect(conversationIdFromPath("/chat")).toBeNull();
    expect(conversationIdFromPath("/u/x")).toBeNull();
  });
});
