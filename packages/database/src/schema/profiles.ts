import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth.js";

export const identityModeEnum = { enumValues: ["FULL_NAME", "FIRST_NAME", "NICKNAME", "NICKNAME_AND_NAME", "HIDDEN"] as const };
export const userRoleEnum = { enumValues: ["ADMIN", "MODERATOR"] as const };

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    nickname: text("nickname"),
    avatarUrl: text("avatar_url"),
    career: text("career"),
    currentSubject: text("current_subject"),
    bio: text("bio"),
    instagram: text("instagram"),
    studentNumber: text("student_number"),
    identityMode: text("identity_mode", { enum: identityModeEnum.enumValues }).notNull().default("HIDDEN"),
    // Free-text name the user typed in "¿Cómo te ven otras personas?". Overrides the name
    // `identityMode` resolves to (never applies while HIDDEN). NULL = use the mode's name.
    customName: text("custom_name"),
    // Fun random Spanish alias shown instead of "Usuario anónimo" while hidden. NULL when the user
    // doesn't currently need one (visible identity with a non-empty name) — freed for reuse.
    alias: text("alias"),
    // `alias` lowercased in JS (SQLite has no lower() expression index here); set whenever `alias` is.
    aliasLower: text("alias_lower"),
    // Catalog id (`ANIMALS` in @sala/contracts) of the animal in `alias`. NULL on legacy aliases whose
    // noun isn't a catalog animal — `AliasService` reassigns those lazily.
    aliasAnimal: text("alias_animal"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("user_profiles_alias_lower_unique").on(table.aliasLower)],
);

export const userPrivacySettings = sqliteTable("user_privacy_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  showFullName: integer("show_full_name", { mode: "boolean" }).notNull().default(false),
  showNickname: integer("show_nickname", { mode: "boolean" }).notNull().default(false),
  showCareer: integer("show_career", { mode: "boolean" }).notNull().default(false),
  showCurrentSubject: integer("show_current_subject", { mode: "boolean" }).notNull().default(false),
  showInstagram: integer("show_instagram", { mode: "boolean" }).notNull().default(false),
  showStudentNumber: integer("show_student_number", { mode: "boolean" }).notNull().default(false),
  showAvatar: integer("show_avatar", { mode: "boolean" }).notNull().default(false),
  showInRoom: integer("show_in_room", { mode: "boolean" }).notNull().default(false),
  showSeat: integer("show_seat", { mode: "boolean" }).notNull().default(false),
  allowDirectMessages: integer("allow_direct_messages", { mode: "boolean" }).notNull().default(true),
  showInPeopleSearch: integer("show_in_people_search", { mode: "boolean" }).notNull().default(true),
  allowFriendRequests: integer("allow_friend_requests", { mode: "boolean" }).notNull().default(true),
  // Whether the user appears in rankings at all — default true so opting *out* is the deliberate
  // action. Distinct from `showInRoom`: a user can rank under their alias without being linkable.
  showInRanking: integer("show_in_ranking", { mode: "boolean" }).notNull().default(true),
  // Whether hidden users appear on the map as their alias animal (off = generic silhouette).
  showAliasAnimalOnMap: integer("show_alias_animal_on_map", { mode: "boolean" }).notNull().default(true),
  // Admins only: whether their photo carries the gold "Admin" badge.
  showAdminBadge: integer("show_admin_badge", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

/**
 * Aliases retired forever (lowercased) — so a retired alias can never be handed out to someone
 * else (a stable, un-relinkable identifier must not become ambiguous). Aliases are otherwise
 * permanent; one is retired only when a legacy non-catalog alias is replaced by a catalog one.
 * `AliasService` checks this table (in addition to the live uniqueness on `user_profiles.alias`)
 * before assigning a candidate, and inserts into it whenever an alias is retired.
 */
export const retiredAliases = sqliteTable(
  "retired_aliases",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    alias: text("alias").notNull(),
    // `alias` lowercased in JS; carries the case-insensitive uniqueness.
    aliasLower: text("alias_lower").notNull(),
    retiredAt: integer("retired_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("retired_aliases_alias_lower_unique").on(table.aliasLower)],
);

export const userReputation = sqliteTable("user_reputation", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  observationScore: real("observation_score").notNull().default(0),
  attendanceScore: real("attendance_score").notNull().default(0),
  spamScore: real("spam_score").notNull().default(0),
  confirmedObservations: integer("confirmed_observations").notNull().default(0),
  rejectedObservations: integer("rejected_observations").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: userRoleEnum.enumValues }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);
