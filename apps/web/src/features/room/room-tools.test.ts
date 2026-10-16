import type { SeatDto } from "@sala/contracts";
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
    expect(pickFreeSeat({ seats }, ["c"])?.id).toBe("c");
  });

  it("with several favorites, the first free one in order wins", () => {
    const seats = [seat("a", "t1", "FREE"), seat("f1", "t2", "OCCUPIED"), seat("f2", "t2", "FREE"), seat("f3", "t3", "FREE")];
    expect(pickFreeSeat({ seats }, ["f1", "f3", "f2"])?.id).toBe("f3");
  });

  it("ignores a favorite that is not free", () => {
    const seats = [seat("a", "t1", "FREE"), seat("fav", "t2", "OCCUPIED")];
    expect(pickFreeSeat({ seats }, ["fav"])?.id).toBe("a");
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
    const url = "https://example.test/sala/principal";
    expect(roomShareText(summary, url)).toBe("Hay 1 lugar libre ahora en la sala de estudio. Miralo en vivo: https://example.test/sala/principal");
    expect(roomShareText({ ...summary, free: 27 }, url)).toBe("Hay 27 lugares libres ahora en la sala de estudio. Miralo en vivo: https://example.test/sala/principal");
  });

  it("says the room is full when nothing is free", () => {
    const summary = { roomId: "r", free: 0, occupied: 108, saved: 0, uncertain: 0, unknown: 0, total: 108 };
    expect(roomShareText(summary, "https://example.test/sala/principal")).toBe(
      "La sala está llena ahora mismo. Miralo en vivo: https://example.test/sala/principal",
    );
  });
});
