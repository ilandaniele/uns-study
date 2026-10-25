import { z } from "zod";

/** Native emoji only; no picker library or downloaded emoji assets. One reaction per person/message. */
export const CHAT_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "🎉",
  "😮",
  "😢",
  "🙏",
  "🔥",
  "👏",
  "💪",
  "📚",
  "🧠",
  "✅",
  "🤔",
  "👀",
  "🙌",
  "🥹",
  "😎",
  "☕",
  "🐶",
] as const;
export const reactionScopeSchema = z.enum(["ROOM", "DM", "GROUP"]);
export type ReactionScope = z.infer<typeof reactionScopeSchema>;
export const messageReactionSchema = z
  .object({ emoji: z.enum(CHAT_REACTION_EMOJIS).nullable() })
  .strict();
export const reactionIdsSchema = z
  .string()
  .transform((ids) => ids.split(","))
  .pipe(z.array(z.uuid()).min(1).max(50));
export interface MessageReactionCount {
  emoji: string;
  count: number;
  mine: boolean;
}
export type MessageReactionsDto = Record<string, MessageReactionCount[]>;
export interface MessageReactionChanged {
  scope: ReactionScope;
  threadId: string;
  messageId: string;
}
