import { describe, expect, it } from "vitest";
import { isWatchingMode, watchSeatIdsFor } from "./seat-watch";

const seat = (id: string) => ({ id });
const table = Array.from({ length: 8 }, (_, i) => seat(`s${i + 1}`));

describe("watchSeatIdsFor", () => {
  it("watches only the tapped seat in seat mode", () => {
    expect(watchSeatIdsFor("seat", seat("s3"), table)).toEqual(["s3"]);
  });

  it("watches the whole table in table mode, tapped seat first", () => {
    const ids = watchSeatIdsFor("table", seat("s3"), table);
    expect(ids[0]).toBe("s3");
    expect([...ids].sort()).toEqual(table.map((s) => s.id).sort());
  });

  it("includes the tapped seat even if tableSeats is empty", () => {
    expect(watchSeatIdsFor("table", seat("s1"), [])).toEqual(["s1"]);
  });

  it("caps at 12 seats and never duplicates", () => {
    const many = Array.from({ length: 20 }, (_, i) => seat(`x${i}`));
    const ids = watchSeatIdsFor("table", many[15]!, [...many, many[0]!]);
    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe("x15");
    expect(new Set(ids).size).toBe(12);
  });
});

describe("isWatchingMode", () => {
  it("matches regardless of order", () => {
    expect(isWatchingMode(["s3"], "seat", seat("s3"), table)).toBe(true);
    expect(isWatchingMode([...table.map((s) => s.id)].reverse(), "table", seat("s3"), table)).toBe(true);
  });

  it("does not match a different set", () => {
    expect(isWatchingMode(["s4"], "seat", seat("s3"), table)).toBe(false);
    expect(isWatchingMode(["s3"], "table", seat("s3"), table)).toBe(false);
  });
});
