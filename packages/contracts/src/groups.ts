import { z } from "zod";

export const GROUP_MAX_MEMBERS = 20; // includes owner
export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUP_MESSAGE_MAX_LENGTH = 1000;

export type GroupRole = "OWNER" | "MEMBER";

export interface GroupMemberDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Catalog animal of the alias when the shown name IS the alias (same rule as room chat); else null. */
  aliasAnimal: string | null;
  role: GroupRole;
}

export interface GroupLastMessageDto {
  senderId: string;
  senderName: string;
  /** null when deleted */
  content: string | null;
  deleted: boolean;
  createdAt: string; // ISO
}

export interface GroupConversationDto {
  id: string;
  name: string;
  /** All current members incl. the viewer, OWNER first, then joinedAt asc. */
  members: GroupMemberDto[];
  lastMessage: GroupLastMessageDto | null;
  /** Messages from others after coalesce(member.last_read_at, member.joined_at). */
  unread: number;
  /** null until the first message. */
  lastMessageAt: string | null;
  /** ISO; sort key fallback for groups without messages. */
  createdAt: string;
  myRole: GroupRole;
}

export interface GroupMessageDto {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  senderAliasAnimal: string | null;
  /** null when deleted */
  content: string | null;
  deleted: boolean;
  createdAt: string; // ISO
}

/** A user the caller may add to a group (has a direct_conversations row with them, not blocked, accepts DMs). */
export interface GroupContactDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  aliasAnimal: string | null;
}

/** Payload of SocketEvents.GroupUpdated. */
export interface GroupUpdatedEvent {
  groupId: string;
}

const userIdSchema = z.string().min(1).max(64);
const distinct = (ids: string[]) => new Set(ids).size === ids.length;

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH),
  memberIds: z.array(userIdSchema).min(1).max(GROUP_MAX_MEMBERS - 1).refine(distinct, { message: "memberIds must be distinct" }),
});

export const addGroupMembersSchema = z.object({
  userIds: z.array(userIdSchema).min(1).max(GROUP_MAX_MEMBERS - 1).refine(distinct, { message: "userIds must be distinct" }),
});

export const groupSendSchema = z.object({
  content: z.string().trim().min(1).max(GROUP_MESSAGE_MAX_LENGTH),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
