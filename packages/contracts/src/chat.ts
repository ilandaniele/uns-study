import { z } from "zod";

export interface ChatMessageDto {
  id: string;
  chatRoomId: string;
  author: { userId: string; displayName: string; avatarUrl: string | null };
  /** `null` when the message was deleted. */
  content: string | null;
  deleted: boolean;
  createdAt: string;
}

// ---- zod ----

export const chatMessageSchema = z.object({
  content: z.string().trim().min(1).max(500),
});
