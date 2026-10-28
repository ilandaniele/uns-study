import { z } from "zod";
import type { AdminBadgeLevel } from "./profiles";
import type { Page } from "./social";

/** An alias never carries the underlying account id. */
export const friendTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), userId: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal("alias"), alias: z.string().trim().min(1).max(80) }).strict(),
]);
export type FriendTarget = z.infer<typeof friendTargetSchema>;
export type FriendState = "NONE" | "SELF" | "INCOMING" | "OUTGOING" | "FRIENDS";
export interface FriendStateDto {
  state: FriendState;
  friendshipId: string | null;
  canRequest: boolean;
  retryAt: string | null;
}
export interface PersonSearchDto {
  target: FriendTarget;
  displayName: string;
  avatarUrl: string | null;
  aliasAnimal: string | null;
  career: string | null;
  profileHref: string | null;
  adminBadge: AdminBadgeLevel;
  friendship: FriendStateDto;
}
export interface FriendshipDto {
  id: string;
  person: PersonSearchDto;
  createdAt: string;
}
export type FriendsView = "friends" | "incoming" | "outgoing";
export interface FriendsPageDto extends Page<FriendshipDto> {
  counts: Record<FriendsView, number>;
}
export const friendRequestSchema = z.object({ target: friendTargetSchema }).strict();
export const friendResponseSchema = z.object({ action: z.enum(["ACCEPT", "DECLINE"]) }).strict();
export const peopleSearchSchema = z.object({
  q: z.string().trim().min(2).max(80),
  cursor: z.string().regex(/^\d{1,6}$/).optional(),
});
export const friendsListSchema = z.object({
  q: z.string().trim().max(80).optional(),
  view: z.enum(["friends", "incoming", "outgoing"]).default("friends"),
  cursor: z.string().regex(/^\d{1,6}$/).optional(),
});
export const FRIENDS_PAGE_SIZE = 25;
export const FRIEND_REQUEST_COOLDOWN_MS = 24 * 60 * 60_000;
