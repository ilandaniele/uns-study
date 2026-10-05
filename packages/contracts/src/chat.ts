import { z } from "zod";
import type { Page } from "./social.js";

export interface ChatMessageDto {
  id: string;
  chatRoomId: string;
  /** `null` when the author is shown as alias (never links the alias to an account). */
  author: { userId: string | null; displayName: string; avatarUrl: string | null; /** Alias animal id when the name shown is the alias. */ aliasAnimal?: string | null; /** Draw the gold "Admin" badge. */ adminBadge?: boolean };
  /** `null` when the message was deleted. */
  content: string | null;
  deleted: boolean;
  createdAt: string;
  /** Set only on per-viewer REST responses: the caller wrote this message (the realtime broadcast never carries it). */
  mine?: boolean;
}

/** Response shape for `GET /rooms/:idOrSlug/messages` — a page plus the chat room id so callers can join realtime immediately. */
export type ChatHistoryDto = Page<ChatMessageDto> & { chatRoomId: string };

// ---- zod ----

export const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(500),
});
