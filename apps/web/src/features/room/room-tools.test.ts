import type { SeatDto } from "@uns/contracts";
import { describe, expect, it } from "vitest";
import { pickFreeSeat, roomShareText } from "./room-tools";

function seat(id: string, tableId: string, status: SeatDto["status"], confidence = 0.5): SeatDto {
  return {
    id,
    tableId,
    code: id,
    seatNumber: 1,
    x: 0,
    y: 0,
    rotation: 0,
    status,
    confidence,
    lastUpdatedAt: null,
    sourceSummary: null,
    dispute: null,
    verified: false,
    occupiedUntil: null,
  };
}

describe("pickFreeSeat", () => {
  it("returns null when nothing is free", () => {
    expect(pickFreeSeat({ seats: [seat("a", "t1", "OCCUPIED")] })).toBeNull();
  });

  it("prefers the favorite seat when it is free", () => {
    const seats = [seat("a", "t1", "FREE"), seat("b", "t1", "FREE"), seat("c", "t2", "FREE")];
    expect(pickFreeSeat({ seats }, "c")?.id).toBe("c");
  });

  it("ignores a favorite that is not free", () => {
    const seats = [seat("a", "t1", "FREE"), seat("fav", "t2", "OCCUPIED")];
    expect(pickFreeSeat({ seats }, "fav")?.id).toBe("a");
  });

  it("picks the table with the most free seats, then the highest confidence", () => {
    const seats = [
      seat("a", "t1", "FREE", 0.9),
      seat("b", "t2", "FREE", 0.2),
      seat("c", "t2", "FREE", 0.6),
      seat("d", "t2", "OCCUPIED"),
    ];
    expect(pickFreeSeat({ seats })?.id).toBe("c");
  });
});

describe("roomShareText", () => {
  it("pluralizes the free count", () => {
    const summary = { roomId: "r", free: 1, occupied: 0, saved: 0, uncertain: 0, unknown: 107, total: 108 };
    expect(roomShareText("Sala principal", summary)).toBe("Sala principal: 1 lugar libre de 108 ahora mismo.");
    expect(roomShareText("Sala principal", { ...summary, free: 12 })).toBe("Sala principal: 12 lugares libres de 108 ahora mismo.");
  });
});
