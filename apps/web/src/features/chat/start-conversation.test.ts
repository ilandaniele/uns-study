import type { ApiError, ConversationDto } from "@sala/contracts";
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api";
import { conversationErrorMessage, findConversationWith } from "./start-conversation";

function apiError(code: ApiError["error"]["code"]) {
  return new ApiRequestError({ error: { code, message: "x" } }, 400);
}

describe("conversationErrorMessage", () => {
  it("maps known codes", () => {
    expect(conversationErrorMessage(apiError("DM_NOT_ALLOWED"))).toBe("Esta persona no acepta mensajes directos.");
    expect(conversationErrorMessage(apiError("BLOCKED"))).toBe("No podés enviarle mensajes a esta persona.");
    expect(conversationErrorMessage(apiError("RATE_LIMITED"))).toBe("Abriste muchas conversaciones nuevas. Probá de nuevo en un rato.");
  });

  it("falls back for unknown codes and non-API errors", () => {
    expect(conversationErrorMessage(apiError("NOT_FOUND"))).toBe("No pudimos abrir la conversación.");
    expect(conversationErrorMessage(new Error("boom"))).toBe("No pudimos abrir la conversación.");
  });
});

describe("findConversationWith", () => {
  const conv = (id: string, userId: string): ConversationDto => ({
    id,
    otherUser: { userId, displayName: "N", avatarUrl: null },
    lastMessage: null,
    unread: 0,
    lastMessageAt: null,
  });
  const list = [conv("c1", "u1"), conv("c2", "u2")];

  it("finds an existing conversation", () => {
    expect(findConversationWith(list, "u2")).toBe(list[1]);
  });

  it("returns null on a miss", () => {
    expect(findConversationWith(list, "u3")).toBeNull();
  });
});
