import { and, gte, lte, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@sala/database";
import { APP_SECTIONS, type AppSection, type SectionUsageDto } from "@sala/contracts";
import { DEFAULT_TIMEZONE, localDateOf } from "../common/dates.js";
import type { Clock } from "../platform/clock.js";

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
export function sectionUsageCutoff(now: Date): string {
  return daysBefore(localDateOf(now, DEFAULT_TIMEZONE), 29);
}

export class SectionUsageService {
  private lastPrunedDay: string | null = null;
  constructor(private readonly db: Db, private readonly clock: Clock) {}

  record(section: AppSection): void {
    const localDate = localDateOf(this.clock.now(), DEFAULT_TIMEZONE);
    this.db.transaction(tx => {
      if (this.lastPrunedDay !== localDate) tx.delete(schema.appSectionDailyViews).where(lt(schema.appSectionDailyViews.localDate, sectionUsageCutoff(this.clock.now()))).run();
      tx.insert(schema.appSectionDailyViews).values({ localDate, section, views: 1 })
        .onConflictDoUpdate({ target: [schema.appSectionDailyViews.localDate, schema.appSectionDailyViews.section], set: { views: sql`${schema.appSectionDailyViews.views} + 1` } }).run();
    });
    this.lastPrunedDay = localDate;
  }

  get(days: 7 | 30): SectionUsageDto {
    const toDate = localDateOf(this.clock.now(), DEFAULT_TIMEZONE);
    const fromDate = daysBefore(toDate, days - 1);
    const rows = this.db.select({ section: schema.appSectionDailyViews.section, views: sql<number>`sum(${schema.appSectionDailyViews.views})` })
      .from(schema.appSectionDailyViews).where(and(gte(schema.appSectionDailyViews.localDate, fromDate), lte(schema.appSectionDailyViews.localDate, toDate)))
      .groupBy(schema.appSectionDailyViews.section).all();
    const counts = new Map(rows.map(row => [row.section, Number(row.views)]));
    const sections = APP_SECTIONS.map(section => ({ section, views: counts.get(section) ?? 0 })).sort((a, b) => b.views - a.views);
    return { days, fromDate, toDate, total: sections.reduce((n, section) => n + section.views, 0), sections };
  }
}
