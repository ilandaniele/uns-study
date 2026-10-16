import { describe, expect, it } from "vitest";
import { isCheckViolation, isForeignKeyViolation, isMissingSchemaError, isUniqueViolation, orDefault, orDefaultSync } from "./sqlite-errors.js";

function driverError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("sqlite-errors", () => {
  it("detects better-sqlite3 unique violations by code", () => {
    const err = driverError("SQLITE_CONSTRAINT_UNIQUE", "UNIQUE constraint failed: check_ins.user_id");
    expect(isUniqueViolation(err)).toBe(true);
    expect(isUniqueViolation(err, ["check_ins.user_id"])).toBe(true);
    expect(isUniqueViolation(err, ["check_ins.seat_id"])).toBe(false);
    expect(isUniqueViolation(err, ["check_ins.seat_id", "check_ins.user_id"])).toBe(true);
  });

  it("treats primary key collisions as unique violations", () => {
    expect(isUniqueViolation(driverError("SQLITE_CONSTRAINT_PRIMARYKEY", "UNIQUE constraint failed: user.id"))).toBe(true);
  });

  it("detects DO-style errors that only carry the message", () => {
    const err = new Error("UNIQUE constraint failed: index 'idx_check_ins_active_user': SQLITE_CONSTRAINT");
    expect(isUniqueViolation(err)).toBe(true);
    expect(isUniqueViolation(err, ["idx_check_ins_active_user"])).toBe(true);
    expect(isUniqueViolation(err, ["other_index"])).toBe(false);
  });

  it("follows cause chains and ignores the wrapper's query text for targets", () => {
    const inner = driverError("SQLITE_CONSTRAINT_UNIQUE", "UNIQUE constraint failed: check_ins.user_id");
    const wrapped = new Error('Failed query: insert into "check_ins" (seat_id) values (?)', { cause: inner });
    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(wrapped, ["check_ins.user_id"])).toBe(true);
    expect(isUniqueViolation(wrapped, ["check_ins.seat_id"])).toBe(false);
  });

  it("does not confuse the constraint kinds", () => {
    const fk = driverError("SQLITE_CONSTRAINT_FOREIGNKEY", "FOREIGN KEY constraint failed");
    const check = driverError("SQLITE_CONSTRAINT_CHECK", "CHECK constraint failed: seats_status_check");
    expect(isForeignKeyViolation(fk)).toBe(true);
    expect(isForeignKeyViolation(check)).toBe(false);
    expect(isCheckViolation(check)).toBe(true);
    expect(isCheckViolation(new Error("CHECK constraint failed: x"))).toBe(true);
    expect(isUniqueViolation(fk)).toBe(false);
    expect(isUniqueViolation(check)).toBe(false);
  });

  it("is false for unrelated values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("UNIQUE constraint failed")).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
  });
});

describe("missing schema tolerance", () => {
  it("matches the three message forms", () => {
    expect(isMissingSchemaError(new Error("no such table: seat_watches"))).toBe(true);
    expect(isMissingSchemaError(new Error("no such column: weekly_goal_minutes"))).toBe(true);
    expect(isMissingSchemaError(new Error("table users has no column named foo"))).toBe(true);
  });

  it("finds the message in a nested cause", () => {
    const inner = new Error("SQLITE_ERROR: no such table: study_goals");
    const wrapped = new Error('Failed query: select from "study_goals"', { cause: new Error("outer", { cause: inner }) });
    expect(isMissingSchemaError(wrapped)).toBe(true);
  });

  it("is false for other errors and non-errors", () => {
    expect(isMissingSchemaError(new Error("UNIQUE constraint failed: x.y"))).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
    expect(isMissingSchemaError("no such table")).toBe(false);
  });

  it("orDefault returns the value, the fallback on a missing table, and rethrows anything else", async () => {
    await expect(orDefault(() => 1, 0)).resolves.toBe(1);
    await expect(orDefault(async () => 1, 0)).resolves.toBe(1);
    await expect(
      orDefault(() => {
        throw new Error("no such table: seat_watches");
      }, 7),
    ).resolves.toBe(7);
    await expect(orDefault(() => Promise.reject(new Error("no such table: seat_watches")), 8)).resolves.toBe(8);
    await expect(orDefault(() => Promise.reject(new Error("boom")), 0)).rejects.toThrow("boom");
  });

  it("orDefaultSync returns the value, the fallback on a missing table, and rethrows anything else", () => {
    expect(orDefaultSync(() => 1, 0)).toBe(1);
    expect(
      orDefaultSync(() => {
        throw new Error("x", { cause: new Error("no such column: a") });
      }, 5),
    ).toBe(5);
    expect(() =>
      orDefaultSync(() => {
        throw new Error("boom");
      }, 0),
    ).toThrow("boom");
  });
});
