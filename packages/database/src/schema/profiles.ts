import { boolean, integer, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth.js";

export const identityModeEnum = pgEnum("identity_mode", ["FULL_NAME", "FIRST_NAME", "NICKNAME", "NICKNAME_AND_NAME", "HIDDEN"]);
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MODERATOR"]);

export const userProfiles = pgTable(
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
    identityMode: identityModeEnum("identity_mode").notNull().default("HIDDEN"),
    // Fun random Spanish alias shown instead of "Usuario anónimo" while hidden. NULL when the user
    // doesn't currently need one (visible identity with a non-empty name) — freed for reuse.
    alias: text("alias"),
    // Catalog id (`ANIMALS` in @sala/contracts) of the animal in `alias`. NULL on legacy aliases whose
    // noun isn't a catalog animal — `AliasService` reassigns those lazily.
    aliasAnimal: text("alias_animal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_profiles_alias_lower_unique").on(sql`lower(${table.alias})`)],
);

export const userPrivacySettings = pgTable("user_privacy_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  showFullName: boolean("show_full_name").notNull().default(false),
  showNickname: boolean("show_nickname").notNull().default(false),
  showCareer: boolean("show_career").notNull().default(false),
  showCurrentSubject: boolean("show_current_subject").notNull().default(false),
  showInstagram: boolean("show_instagram").notNull().default(false),
  showStudentNumber: boolean("show_student_number").notNull().default(false),
  showAvatar: boolean("show_avatar").notNull().default(false),
  showInRoom: boolean("show_in_room").notNull().default(false),
  showSeat: boolean("show_seat").notNull().default(false),
  allowDirectMessages: boolean("allow_direct_messages").notNull().default(true),
  // Whether the user appears in rankings at all — default true so opting *out* is the deliberate
  // action. Distinct from `showInRoom`: a user can rank under their alias without being linkable.
  showInRanking: boolean("show_in_ranking").notNull().default(true),
  // Whether hidden users appear on the map as their alias animal (off = generic silhouette).
  showAliasAnimalOnMap: boolean("show_alias_animal_on_map").notNull().default(true),
  // Admins only: whether their photo carries the gold "Admin" badge.
  showAdminBadge: boolean("show_admin_badge").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Aliases retired forever (lowercased) — so a retired alias can never be handed out to someone
 * else (a stable, un-relinkable identifier must not become ambiguous). Aliases are otherwise
 * permanent; one is retired only when a legacy non-catalog alias is replaced by a catalog one.
 * `AliasService` checks this table (in addition to the live uniqueness on `user_profiles.alias`)
 * before assigning a candidate, and inserts into it whenever an alias is retired.
 */
export const retiredAliases = pgTable(
  "retired_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alias: text("alias").notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("retired_aliases_alias_lower_unique").on(sql`lower(${table.alias})`)],
);

export const userReputation = pgTable("user_reputation", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  observationScore: real("observation_score").notNull().default(0),
  attendanceScore: real("attendance_score").notNull().default(0),
  spamScore: real("spam_score").notNull().default(0),
  confirmedObservations: integer("confirmed_observations").notNull().default(0),
  rejectedObservations: integer("rejected_observations").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);
