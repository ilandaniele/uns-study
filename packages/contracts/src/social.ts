import { z } from "zod";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ConversationDto {
  id: string;
  otherUser: { userId: string; displayName: string; avatarUrl: string | null };
  lastMessage: DirectMessageDto | null;
  unread: number;
  lastMessageAt: string | null;
}

export interface DirectMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  deleted: boolean;
  createdAt: string;
}

// ---- zod ----

export const dmSendSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});

export const createConversationSchema = z.object({
  userId: z.string(),
});
