import { and, gte, inArray } from "drizzle-orm";
import { inChunks, schema, type Db } from "@sala/database";
import { orDefault } from "../common/sqlite-errors.js";

/** user -> frozen local dates >= sinceLocalDate. A missing table (migration not applied) yields an empty Map. */
export async function loadFrozenDates(db: Db, userIds: readonly string[], sinceLocalDate: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return out;
  const rows = await orDefault(
    () =>
      inChunks(unique, (part) =>
        db
          .select({ userId: schema.streakFreezes.userId, localDate: schema.streakFreezes.localDate })
          .from(schema.streakFreezes)
          .where(and(inArray(schema.streakFreezes.userId, part), gte(schema.streakFreezes.localDate, sinceLocalDate)))
          .all(),
      ),
    [],
  );
  for (const row of rows) {
    const days = out.get(row.userId) ?? new Set<string>();
    days.add(row.localDate);
    out.set(row.userId, days);
  }
  return out;
}
