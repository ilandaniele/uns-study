import { boolean, integer, pgEnum, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const identityModeEnum = pgEnum("identity_mode", ["FULL_NAME", "FIRST_NAME", "NICKNAME", "NICKNAME_AND_NAME", "HIDDEN"]);
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MODERATOR"]);

export const userProfiles = pgTable("user_profiles", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
