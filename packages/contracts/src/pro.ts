import { z } from "zod";
import type { RankingCategory, RankingEntryDto, RankingPeriod } from "./rankings";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// 1 Seat watch
export const SEAT_WATCH_MAX_SEATS = 12;
export const SEAT_WATCH_TTL_MINUTES = 120;
export const seatWatchRequestSchema = z.object({ seatIds: z.array(z.string().min(1).max(64)).min(1).max(SEAT_WATCH_MAX_SEATS) });
export type SeatWatchRequest = z.infer<typeof seatWatchRequestSchema>;
export interface SeatWatchDto {
  roomId: string;
  seatIds: string[];
  expiresAt: string;
}
export interface SeatWatchResponse {
  watch: SeatWatchDto | null;
}

// 2 Study history
export const studyHistoryQuerySchema = z.object({ days: z.enum(["30", "90"]).default("30") });
export interface StudyHistoryDto {
  days: 30 | 90;
  /** Local dates, inclusive; `to` = today (ART). */
  from: string;
  to: string;
  totalMinutes: number;
  sessionCount: number;
  activeDays: number;
  /** Every day from..to, zero-filled, oldest first. */
  byDay: { date: string; minutes: number }[];
  /** Length 7, index 0 = Monday, total minutes. */
  byWeekday: number[];
  /** Length 24, minutes overlapping each ART hour. */
  byHour: number[];
  /** Argmax of `byHour`; null if all zero. */
  bestHour: number | null;
  streak: { current: number; longest: number; frozenDates: string[] };
}

// 3 Forecast
export const FORECAST_START_HOUR = 7;
/** Inclusive: 17 slots. */
export const FORECAST_END_HOUR = 23;
/** `grid[weekday 0 = Mon][hour - 7]`: occupancy ratio 0..1 with 2 decimals; null = no sample. */
export interface ForecastData {
  sampleDays: number;
  grid: (number | null)[][];
}
export interface RoomForecastDto {
  roomId: string;
  computedAt: string | null;
  startHour: number;
  endHour: number;
  sampleDays: number;
  grid: (number | null)[][];
}

// 4 Favorites
export const FAVORITE_SEATS_MAX = 3;
export const favoriteSeatsRequestSchema = z.object({ seatIds: z.array(z.string().min(1).max(64)).max(FAVORITE_SEATS_MAX) });
export interface FavoriteSeatsDto {
  seatIds: string[];
}

// 5 Group study
export const groupFocusRequestSchema = z.object({ minutes: z.number().int().min(5).max(180) });
export const groupSeatShareRequestSchema = z.object({ share: z.boolean() });
export interface GroupFocusDto {
  startedBy: string;
  minutes: number;
  startedAt: string;
  endsAt: string;
}
export interface GroupPresenceMemberDto {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  aliasAnimal: string | null;
  roomSlug: string;
  roomName: string;
  seatId: string;
  seatLabel: string;
  since: string;
  expiresAt: string;
}
export interface GroupPresenceDto {
  members: GroupPresenceMemberDto[];
  sharing: boolean;
  focus: GroupFocusDto | null;
}

// 6 Weekly goal
export const WEEKLY_GOAL_MIN_MINUTES = 60;
export const WEEKLY_GOAL_MAX_MINUTES = 4200;
export const weeklyGoalRequestSchema = z.object({
  minutes: z.number().int().min(WEEKLY_GOAL_MIN_MINUTES).max(WEEKLY_GOAL_MAX_MINUTES).nullable(),
  reminderEnabled: z.boolean().optional(),
});
export type WeeklyGoalRequest = z.infer<typeof weeklyGoalRequestSchema>;
export interface WeeklyGoalDto {
  goalMinutes: number | null;
  reminderEnabled: boolean;
  weekStart: string;
  weekEnd: string;
  studiedMinutes: number;
}

// 7 Badges and streak freeze
export const streakFreezeRequestSchema = z.object({ localDate });
export interface StreakDto {
  current: number;
  longest: number;
  frozenDates: string[];
  freezeAvailableThisMonth: boolean;
  freezableDates: string[];
}
export type BadgeId = "first_session" | "hours_10" | "hours_50" | "hours_100" | "streak_7" | "streak_30" | "early_bird" | "night_owl" | "collaboration_10" | "collaboration_50" | "collaboration_100" | "collaboration_500";
export interface BadgeDto {
  id: BadgeId;
  title: string;
  description: string;
  earned: boolean;
  /** 0..1 */
  progress: number;
}
export interface BadgesDto {
  badges: BadgeDto[];
}

// 9 Exams
export const USER_EXAMS_MAX = 6;
export const examRequestSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  examDate: localDate,
  targetHours: z.number().int().min(1).max(500),
});
export const examPatchSchema = examRequestSchema.partial();
export type ExamRequest = z.infer<typeof examRequestSchema>;
export type ExamPatch = z.infer<typeof examPatchSchema>;
export interface ExamDto {
  id: string;
  subject: string;
  examDate: string;
  targetHours: number;
  createdAt: string;
  /** examDate - today (ART); negative = past. */
  daysLeft: number;
  /** Verified minutes since `createdAt`. */
  studiedMinutes: number;
  /** Null when past or target met. */
  dailyPlanMinutes: number | null;
}
export interface ExamsDto {
  exams: ExamDto[];
  career: string | null;
}

// 10 Profile flair
export const PROFILE_FRAMES = ["none", "gold", "double", "glow", "duo"] as const;
export type ProfileFrameId = (typeof PROFILE_FRAMES)[number];
export const NAME_COLORS = ["default", "ocean", "forest", "berry", "sunset", "violet", "gold"] as const;
export type NameColorId = (typeof NAME_COLORS)[number];
export const profileFlairRequestSchema = z.object({ frame: z.enum(PROFILE_FRAMES), nameColor: z.enum(NAME_COLORS) });
export type ProfileFlairRequest = z.infer<typeof profileFlairRequestSchema>;
/** Shown to others. Only present on paid users with a visible identity whose choice is not all-default. */
export interface ProfileFlairDto {
  frame: ProfileFrameId;
  nameColor: NameColorId;
}
/** `GET|PUT /me/cosmetics`. Defaults ("none"/"default") when nothing is saved. */
export interface MyCosmeticsDto extends ProfileFlairDto {
  /** Paid subscription and a visible identity right now, i.e. others actually see the flair. */
  visibleToOthers: boolean;
}

// 11 Group ranking
/** `GET /groups/:id/rankings`: the room ranking restricted to the group's members. */
export interface GroupRankingDto {
  groupId: string;
  groupName: string;
  roomSlug: string;
  period: RankingPeriod;
  category: RankingCategory;
  entries: RankingEntryDto[];
  me: RankingEntryDto | null;
}

// 12 Quiet room
export const QUIET_ROOM_THRESHOLDS = [30, 50, 70] as const;
export type QuietRoomThreshold = (typeof QUIET_ROOM_THRESHOLDS)[number];
export const QUIET_ROOM_TTL_MINUTES = 240;
/** Rooms with fewer active seats never trigger (too noisy). */
export const QUIET_ROOM_MIN_SEATS = 20;
export const quietWatchRequestSchema = z.object({
  thresholdPct: z.union([z.literal(30), z.literal(50), z.literal(70)]),
});
export type QuietWatchRequest = z.infer<typeof quietWatchRequestSchema>;
export interface QuietWatchDto {
  roomId: string;
  thresholdPct: QuietRoomThreshold;
  expiresAt: string;
}
export interface QuietWatchResponse {
  watch: QuietWatchDto | null;
}
/** Payload of SocketEvents.QuietRoomAlert, sent to the private user channel. */
export interface QuietRoomAlertEvent {
  roomId: string;
  roomSlug: string;
  thresholdPct: number;
  occupancyPct: number;
  free: number;
}
/** Occupancy % the quiet-room alert uses (occupied + saved + uncertain over total), or null below QUIET_ROOM_MIN_SEATS. Shared by API and web. */
export function quietRoomOccupancyPct(s: { total: number; occupied: number; saved: number; uncertain: number }): number | null {
  if (s.total < QUIET_ROOM_MIN_SEATS) return null;
  return Math.round(((s.occupied + s.saved + s.uncertain) / s.total) * 100);
}
