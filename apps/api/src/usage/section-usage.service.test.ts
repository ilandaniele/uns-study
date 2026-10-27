import { beforeEach, describe, expect, it } from "vitest";
import { schema, type Db } from "@sala/database";
import { freshDb } from "../test-utils.js";
import { FixedClock } from "../platform/clock.js";
import { SectionUsageService } from "./section-usage.service.js";

describe("section usage aggregates", () => {
  let db: Db, clock: FixedClock, usage: SectionUsageService;
  beforeEach(() => {
    db = freshDb(); clock = new FixedClock(new Date("2026-10-27T02:59:00Z"));
    usage = new SectionUsageService(db, clock);
  });
  it("increments atomically on Buenos Aires dates and retains no visitor fields", () => {
    usage.record("jardin"); usage.record("jardin"); usage.record("foco");
    const rows = db.select().from(schema.appSectionDailyViews).all();
    expect(rows).toEqual([{ localDate: "2026-10-26", section: "jardin", views: 2 }, { localDate: "2026-10-26", section: "foco", views: 1 }]);
    clock.advance(60_000); usage.record("jardin");
    expect(usage.get(7)).toMatchObject({ fromDate: "2026-10-21", toDate: "2026-10-27", total: 4 });
    expect(usage.get(7).sections.slice(0, 2)).toEqual([{ section: "jardin", views: 3 }, { section: "foco", views: 1 }]);
  });
  it("includes the entire selected period, excludes future rows, and prunes counts outside 30 local days", () => {
    clock.set(new Date("2026-10-27T12:00:00Z"));
    db.insert(schema.appSectionDailyViews).values([
      { localDate: "2026-09-27", section: "sala", views: 100 },
      { localDate: "2026-09-28", section: "sala", views: 5 },
      { localDate: "2026-10-21", section: "foco", views: 3 },
      { localDate: "2026-10-28", section: "jardin", views: 20 },
    ]).run();
    usage.record("guias");
    expect(usage.get(7).total).toBe(4);
    expect(usage.get(30).total).toBe(9);
    expect(db.select().from(schema.appSectionDailyViews).all().some(r => r.localDate === "2026-09-27")).toBe(false);
  });
});
