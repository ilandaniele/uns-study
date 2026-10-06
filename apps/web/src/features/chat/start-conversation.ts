import { createConversationSchema, type ConversationDto } from "@sala/contracts";
import { apiPost, ApiRequestError } from "@/lib/api";

/** POST /api/v1/conversations {userId}: creates or reopens the direct conversation. Throws ApiRequestError. */
export function startConversation(userId: string): Promise<ConversationDto> {
  return apiPost<ConversationDto>("/api/v1/conversations", { userId }, createConversationSchema);
}

/** Spanish (voseo) copy for any failure of `startConversation`. */
export function conversationErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "DM_NOT_ALLOWED") return "Esta persona no acepta mensajes directos.";
    if (err.code === "BLOCKED") return "No podés enviarle mensajes a esta persona.";
    if (err.code === "RATE_LIMITED") return "Abriste muchas conversaciones nuevas. Probá de nuevo en un rato.";
  }
  return "No pudimos abrir la conversación.";
}

/** Existing conversation with that user in the already-loaded list, or null. */
export function findConversationWith(conversations: readonly ConversationDto[], userId: string): ConversationDto | null {
  return conversations.find((c) => c.otherUser.userId === userId) ?? null;
}
