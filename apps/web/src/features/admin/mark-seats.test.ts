import { ADMIN_MARK_SEATS_MAX } from "@sala/contracts";
import { describe, expect, it } from "vitest";
import { markSeatsToastMessage, selectionLabel, toggleSeatSelection } from "./mark-seats";

describe("mark-seats helpers", () => {
  it("toggles a seat in and out of the selection without mutating it", () => {
    const empty = new Set<string>();
    const one = toggleSeatSelection(empty, "s1");
    expect([...one]).toEqual(["s1"]);
    expect(empty.size).toBe(0);
    expect(toggleSeatSelection(one, "s1").size).toBe(0);
  });

  it("stops adding at the API limit", () => {
    const full = new Set(Array.from({ length: ADMIN_MARK_SEATS_MAX }, (_, i) => `s${i}`));
    expect(toggleSeatSelection(full, "extra").size).toBe(ADMIN_MARK_SEATS_MAX);
    expect(toggleSeatSelection(full, "s0").size).toBe(ADMIN_MARK_SEATS_MAX - 1);
  });

  it("labels the selection", () => {
    expect(selectionLabel(0)).toBe("Tocá los lugares en el mapa");
    expect(selectionLabel(1)).toBe("1 lugar elegido");
    expect(selectionLabel(5)).toBe("5 lugares elegidos");
  });

  it("pluralizes the toast and mentions skipped seats", () => {
    expect(markSeatsToastMessage("OCCUPIED", 1, 0)).toBe("Marcamos 1 lugar como ocupado");
    expect(markSeatsToastMessage("FREE", 3, 0)).toBe("Marcamos 3 lugares como libres");
    expect(markSeatsToastMessage("OCCUPIED", 2, 1)).toBe("Marcamos 2 lugares como ocupados. 1 no cambió (tiene a alguien sentado)");
    expect(markSeatsToastMessage("FREE", 0, 2)).toBe("Marcamos 0 lugares como libres. 2 no cambiaron (tienen a alguien sentado)");
  });
});
