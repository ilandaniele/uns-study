import type { SeatDto } from "@sala/contracts";
import { describe, expect, it } from "vitest";
import { contributionsTodayLabel, latestSeatUpdateMs, updatedAgoLabel, visitorsTodayLabel } from "./room-social";

const NOW = new Date("2026-03-10T15:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

function seat(status: SeatDto["status"], sourceSummary: string | null, lastUpdatedAt: string | null) {
  return { status, sourceSummary, lastUpdatedAt };
}

describe("latestSeatUpdateMs", () => {
  it("picks the newest real report and ignores seed/reset stamps and unknown seats", () => {
    const seats = [
      seat("FREE", "OBSERVATION", ago(30)),
      seat("OCCUPIED", "CHECK_IN", ago(5)),
      seat("UNKNOWN", "DAILY_RESET", ago(0)),
      seat("FREE", "DAILY_RESET", ago(1)),
      seat("FREE", "SEED", ago(2)),
      seat("FREE", "OBSERVATION", null),
    ];
    expect(latestSeatUpdateMs(seats)).toBe(Date.parse(ago(5)));
  });

  it("returns null when nothing real was reported", () => {
    expect(latestSeatUpdateMs([seat("UNKNOWN", null, null)])).toBeNull();
    expect(latestSeatUpdateMs([])).toBeNull();
  });
});

describe("updatedAgoLabel", () => {
  it("formats recency", () => {
    expect(updatedAgoLabel(null, NOW)).toBeNull();
    expect(updatedAgoLabel(Date.parse(ago(0)), NOW)).toBe("Actualizado recién");
    expect(updatedAgoLabel(Date.parse(ago(2)), NOW)).toBe("Actualizado hace 2 min");
    expect(updatedAgoLabel(Date.parse(ago(59)), NOW)).toBe("Actualizado hace 59 min");
    expect(updatedAgoLabel(Date.parse(ago(180)), NOW)).toBe("Actualizado hace 3 h");
    expect(updatedAgoLabel(Date.parse(ago(60 * 25)), NOW)).toBeNull();
  });

  it("treats a timestamp slightly in the future (clock skew) as just now", () => {
    expect(updatedAgoLabel(NOW.getTime() + 5_000, NOW)).toBe("Actualizado recién");
  });
});

describe("visitorsTodayLabel", () => {
  it("hides small or unknown counts", () => {
    expect(visitorsTodayLabel(null)).toBeNull();
    expect(visitorsTodayLabel(4)).toBeNull();
    expect(visitorsTodayLabel(5)).toBe("5 personas consultaron la sala hoy");
    expect(visitorsTodayLabel(43)).toBe("43 personas consultaron la sala hoy");
  });
});

describe("contributionsTodayLabel", () => {
  it("pluralizes and hides zero", () => {
    expect(contributionsTodayLabel(null)).toBeNull();
    expect(contributionsTodayLabel(0)).toBeNull();
    expect(contributionsTodayLabel(1)).toBe("Ayudaste a actualizar 1 lugar hoy. ¡Gracias!");
    expect(contributionsTodayLabel(8)).toBe("Ayudaste a actualizar 8 lugares hoy. ¡Gracias!");
  });
});
