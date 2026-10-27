import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Aggregate opens only: no user ids, IPs, URLs, referrers or message content. */
export const appSectionDailyViews = sqliteTable("app_section_daily_views", {
  localDate: text("local_date").notNull(),
  section: text("section").notNull(),
  views: integer("views").notNull().default(0),
}, table => [primaryKey({ columns: [table.localDate, table.section] })]);
