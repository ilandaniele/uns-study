import { describe, expect, it } from "vitest";
import {
  checkInExpiryStatus,
  confidenceWording,
  disputeCountdownLabel,
  disputeKindTitle,
  recencyLabel,
  roomCapacityBreakdown,
  statusLabel,
  tableSideLabel,
} from "./format";

describe("statusLabel", () => {
  it("translates each seat status to Spanish", () => {
    expect(statusLabel("FREE")).toBe("Libre");
    expect(statusLabel("OCCUPIED")).toBe("Ocupado");
    expect(statusLabel("UNCERTAIN")).toBe("Dudoso");
    expect(statusLabel("UNKNOWN")).toBe("Sin datos");
  });
});

describe("confidenceWording", () => {
  it("returns alta confianza for >= 0.8", () => {
    expect(confidenceWording(0.8)).toBe("alta confianza");
    expect(confidenceWording(0.98)).toBe("alta confianza");
  });

  it("returns información reciente for >= 0.5 and < 0.8", () => {
    expect(confidenceWording(0.5)).toBe("información reciente");
    expect(confidenceWording(0.79)).toBe("información reciente");
  });

  it("returns baja confianza below 0.5", () => {
    expect(confidenceWording(0.49)).toBe("baja confianza");
    expect(confidenceWording(0)).toBe("baja confianza");
  });
});

describe("recencyLabel", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  it("returns null when there is no data yet", () => {
    expect(recencyLabel({ status: "FREE", sourceSummary: "OBSERVATION", lastUpdatedAt: null }, now)).toBeNull();
  });

  it("handles minutes", () => {
    expect(
      recencyLabel(
        { status: "FREE", sourceSummary: "OBSERVATION", lastUpdatedAt: new Date("2026-09-25T11:59:30.000Z").toISOString() },
        now,
      ),
    ).toBe("Actualizado hace instantes");
    expect(
      recencyLabel(
        { status: "OCCUPIED", sourceSummary: "CHECK_IN", lastUpdatedAt: new Date("2026-09-25T11:56:00.000Z").toISOString() },
        now,
      ),
    ).toBe("Actualizado hace 4 minutos");
  });

  it("handles hours and days", () => {
    expect(
      recencyLabel(
        { status: "OCCUPIED", sourceSummary: "CHECK_IN", lastUpdatedAt: new Date("2026-09-25T10:00:00.000Z").toISOString() },
        now,
      ),
    ).toBe("Actualizado hace 2 horas");
    expect(
      recencyLabel(
        { status: "FREE", sourceSummary: "OBSERVATION", lastUpdatedAt: new Date("2026-09-23T12:00:00.000Z").toISOString() },
        now,
      ),
    ).toBe("Actualizado hace 2 días");
  });

  it("shows 'Sin información reciente' for UNKNOWN status regardless of timestamp", () => {
    expect(
      recencyLabel({ status: "UNKNOWN", sourceSummary: null, lastUpdatedAt: new Date("2026-09-25T11:59:30.000Z").toISOString() }, now),
    ).toBe("Sin información reciente");
  });

  it("shows the SAVED-dispute wording regardless of status/timestamp", () => {
    expect(
      recencyLabel({ status: "FREE", sourceSummary: "SAVED", lastUpdatedAt: new Date("2026-09-25T11:59:30.000Z").toISOString() }, now),
    ).toBe("Estaba guardado — se liberó por votación");
  });

  it("shows 'Sin información reciente' for seed/daily-reset-only sourceSummary", () => {
    expect(
      recencyLabel({ status: "FREE", sourceSummary: "SEED", lastUpdatedAt: new Date("2026-09-25T11:59:30.000Z").toISOString() }, now),
    ).toBe("Sin información reciente");
    expect(
      recencyLabel({ status: "FREE", sourceSummary: "DAILY_RESET", lastUpdatedAt: new Date("2026-09-25T11:59:30.000Z").toISOString() }, now),
    ).toBe("Sin información reciente");
  });
});

describe("disputeKindTitle", () => {
  it("translates each dispute kind to Spanish", () => {
    expect(disputeKindTitle("CLAIM")).toBe("Me senté acá");
    expect(disputeKindTitle("ABSENT")).toBe("Esa persona no está");
    expect(disputeKindTitle("SAVED")).toBe("Está guardado");
  });
});

describe("disputeCountdownLabel", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  it("formats minutes and seconds as m:ss", () => {
    expect(disputeCountdownLabel(new Date("2026-09-25T12:04:59.000Z").toISOString(), now)).toBe("4:59");
    expect(disputeCountdownLabel(new Date("2026-09-25T12:05:00.000Z").toISOString(), now)).toBe("5:00");
  });

  it("pads seconds under 10", () => {
    expect(disputeCountdownLabel(new Date("2026-09-25T12:01:05.000Z").toISOString(), now)).toBe("1:05");
  });

  it("rounds up sub-second remainders so it never shows 0:00 while time remains", () => {
    expect(disputeCountdownLabel(new Date("2026-09-25T12:00:00.400Z").toISOString(), now)).toBe("0:01");
  });

  it("floors at 0:00 once closesAt has passed", () => {
    expect(disputeCountdownLabel(new Date("2026-09-25T11:59:00.000Z").toISOString(), now)).toBe("0:00");
  });
});

describe("checkInExpiryStatus", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  it("returns null once expiresAt has passed", () => {
    expect(checkInExpiryStatus(new Date("2026-09-25T12:00:00.000Z").toISOString(), now)).toBeNull();
    expect(checkInExpiryStatus(new Date("2026-09-25T11:00:00.000Z").toISOString(), now)).toBeNull();
  });

  it("does not prompt when more than 5 minutes remain", () => {
    const status = checkInExpiryStatus(new Date("2026-09-25T12:30:00.000Z").toISOString(), now);
    expect(status).toEqual({ minutesLeft: 30, shouldPromptExtend: false });
  });

  it("prompts at exactly 5 minutes remaining", () => {
    const status = checkInExpiryStatus(new Date("2026-09-25T12:05:00.000Z").toISOString(), now);
    expect(status).toEqual({ minutesLeft: 5, shouldPromptExtend: true });
  });

  it("prompts and rounds up sub-minute remainders", () => {
    const status = checkInExpiryStatus(new Date("2026-09-25T12:04:30.000Z").toISOString(), now);
    expect(status).toEqual({ minutesLeft: 5, shouldPromptExtend: true });
  });

  it("prompts with 1 minute left just before expiry", () => {
    const status = checkInExpiryStatus(new Date("2026-09-25T12:00:30.000Z").toISOString(), now);
    expect(status).toEqual({ minutesLeft: 1, shouldPromptExtend: true });
  });
});

describe("tableSideLabel", () => {
  it("returns null for wall bars", () => {
    expect(tableSideLabel({ x: 0, width: 100, type: "WALL_BAR" }, 1000)).toBeNull();
  });

  it("returns null when there is no table", () => {
    expect(tableSideLabel(null, 1000)).toBeNull();
  });

  it("labels a table left of center as lado izquierdo", () => {
    expect(tableSideLabel({ x: 40, width: 200, type: "MAIN_TABLE" }, 1000)).toBe("lado izquierdo");
  });

  it("labels a table right of center as lado derecho", () => {
    expect(tableSideLabel({ x: 700, width: 200, type: "MAIN_TABLE" }, 1000)).toBe("lado derecho");
  });
});

describe("roomCapacityBreakdown", () => {
  it("groups tables by type with the seat count per table", () => {
    const map = {
      tables: [
        { id: "t1", type: "MAIN_TABLE" as const },
        { id: "t2", type: "MAIN_TABLE" as const },
        { id: "b1", type: "WALL_BAR" as const },
      ],
      seats: [
        { tableId: "t1" }, { tableId: "t1" }, { tableId: "t1" }, { tableId: "t1" },
        { tableId: "t1" }, { tableId: "t1" }, { tableId: "t1" }, { tableId: "t1" },
        { tableId: "t2" }, { tableId: "t2" }, { tableId: "t2" }, { tableId: "t2" },
        { tableId: "t2" }, { tableId: "t2" }, { tableId: "t2" }, { tableId: "t2" },
        { tableId: "b1" }, { tableId: "b1" }, { tableId: "b1" },
      ],
    };
    expect(roomCapacityBreakdown(map as never)).toEqual([
      { label: "mesas", tableCount: 2, seatsPerTable: 8 },
      { label: "barras individuales", tableCount: 1, seatsPerTable: 3 },
    ]);
  });

  it("returns an empty array for a room with no tables", () => {
    expect(roomCapacityBreakdown({ tables: [], seats: [] })).toEqual([]);
  });
});
