import { z } from "zod";
import type { Page } from "./social.js";

export interface ChatMessageDto {
  id: string;
  chatRoomId: string;
  author: { userId: string; displayName: string; avatarUrl: string | null; /** Alias animal id when the name shown is the alias. */ aliasAnimal?: string | null };
  /** `null` when the message was deleted. */
  content: string | null;
  deleted: boolean;
  createdAt: string;
}

/** Response shape for `GET /rooms/:idOrSlug/messages` — a page plus the chat room id so callers can join realtime immediately. */
export type ChatHistoryDto = Page<ChatMessageDto> & { chatRoomId: string };

// ---- zod ----

export const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(500),
});
