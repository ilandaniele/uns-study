import { describe, expect, it } from "vitest";
import { mergeMessages } from "./grouping";

const msg = (id: string, createdAt: string, deleted = false) => ({ id, createdAt, deleted });

describe("mergeMessages", () => {
  it("fills the gap between the history page and the realtime join, oldest first", () => {
    const shown = [msg("a", "2026-09-29T10:00:00Z"), msg("c", "2026-09-29T10:02:00Z")];
    const page = [msg("c", "2026-09-29T10:02:00Z"), msg("b", "2026-09-29T10:01:00Z")];
    expect(mergeMessages(shown, page).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("prefers the fresh copy (e.g. a deletion)", () => {
    const merged = mergeMessages([msg("a", "2026-09-29T10:00:00Z")], [msg("a", "2026-09-29T10:00:00Z", true)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.deleted).toBe(true);
  });
});
