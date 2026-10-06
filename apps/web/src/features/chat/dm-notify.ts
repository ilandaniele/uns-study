import type { DirectMessageDto, GroupMessageDto } from "@sala/contracts";

export const DM_SOUND_COOLDOWN_MS = 2000;

export interface DmNotifyInput {
  message: Pick<DirectMessageDto, "senderId" | "conversationId">;
  currentUserId: string;
  soundEnabled: boolean;
  /** Conversation visibly on screen (widget DM top + card visible, or /chat/dm/{id}). */
  viewingConversationId: string | null;
  documentVisible: boolean;
  lastPlayedAt: number | null;
  now: number;
}

/** Whether an incoming DM should blip: not yours, not muted, not already on screen, not within the cooldown. */
export function shouldPlayDmSound(input: DmNotifyInput): boolean {
  if (input.message.senderId === input.currentUserId) return false;
  if (!input.soundEnabled) return false;
  if (input.documentVisible && input.viewingConversationId === input.message.conversationId) return false;
  if (input.lastPlayedAt !== null && input.now - input.lastPlayedAt < DM_SOUND_COOLDOWN_MS) return false;
  return true;
}

export interface GroupNotifyInput {
  message: Pick<GroupMessageDto, "senderId" | "groupId">;
  currentUserId: string;
  soundEnabled: boolean;
  /** Group visibly on screen (widget group thread on top + card visible). */
  viewingGroupId: string | null;
  documentVisible: boolean;
  lastPlayedAt: number | null;
  now: number;
}

/** Same rules as `shouldPlayDmSound`, keyed on the group. */
export function shouldPlayGroupSound(input: GroupNotifyInput): boolean {
  if (input.message.senderId === input.currentUserId) return false;
  if (!input.soundEnabled) return false;
  if (input.documentVisible && input.viewingGroupId === input.message.groupId) return false;
  if (input.lastPlayedAt !== null && input.now - input.lastPlayedAt < DM_SOUND_COOLDOWN_MS) return false;
  return true;
}

/** "/chat/dm/abc" -> "abc"; "/chat/dm", "/chat", anything else -> null. Ignores trailing slash / query. */
export function conversationIdFromPath(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0];
  const match = /^\/chat\/dm\/([^/]+)\/?$/.exec(path);
  return match ? match[1] : null;
}
