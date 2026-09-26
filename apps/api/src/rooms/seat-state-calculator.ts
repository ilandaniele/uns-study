import type { SeatStatus } from "@uns/contracts";

export interface SeatObservationInput {
  userId: string;
  status: "FREE" | "OCCUPIED";
  weight: number;
  observedAt: Date;
}

export interface SeatStateInput {
  hasActiveCheckIn: boolean;
  observations: SeatObservationInput[];
}

export interface SeatStateResult {
  status: SeatStatus;
  confidence: number;
  sourceSummary: string;
}

function observationConfidence(distinctUsers: number): number {
  return Math.min(0.5 + 0.15 * (distinctUsers - 1), 0.9);
}

/**
 * Deterministic seat-state derivation. Pure function — no I/O.
 * Priority: active check-in > active observations (FREE/OCCUPIED/conflict) > UNKNOWN.
 * Only the latest observation per user counts (distinct users).
 */
export function calculateSeatState(input: SeatStateInput): SeatStateResult {
  if (input.hasActiveCheckIn) {
    return { status: "OCCUPIED", confidence: 0.98, sourceSummary: "CHECK_IN" };
  }

  // Keep only the latest observation per user.
  const latestByUser = new Map<string, SeatObservationInput>();
  for (const obs of input.observations) {
    const existing = latestByUser.get(obs.userId);
    if (!existing || obs.observedAt.getTime() > existing.observedAt.getTime()) {
      latestByUser.set(obs.userId, obs);
    }
  }
  const latest = [...latestByUser.values()];

  const free = latest.filter((o) => o.status === "FREE");
  const occupied = latest.filter((o) => o.status === "OCCUPIED");

  if (free.length === 0 && occupied.length === 0) {
    return { status: "UNKNOWN", confidence: 0, sourceSummary: "NONE" };
  }

  if (occupied.length === 0) {
    return { status: "FREE", confidence: observationConfidence(free.length), sourceSummary: "OBSERVATION_FREE" };
  }

  if (free.length === 0) {
    return {
      status: "OCCUPIED",
      confidence: observationConfidence(occupied.length),
      sourceSummary: "OBSERVATION_OCCUPIED",
    };
  }

  // Conflict: both sides present. Compare weighted totals; the dominant side (>= 2x the other)
  // wins only if the single newest observation also belongs to that side.
  const weightFree = free.reduce((sum, o) => sum + o.weight, 0);
  const weightOccupied = occupied.reduce((sum, o) => sum + o.weight, 0);
  const newest = latest.reduce((a, b) => (b.observedAt.getTime() > a.observedAt.getTime() ? b : a));

  if (weightFree >= weightOccupied * 2 && newest.status === "FREE") {
    return { status: "FREE", confidence: 0.5, sourceSummary: "OBSERVATION_CONFLICT_FREE" };
  }
  if (weightOccupied >= weightFree * 2 && newest.status === "OCCUPIED") {
    return { status: "OCCUPIED", confidence: 0.5, sourceSummary: "OBSERVATION_CONFLICT_OCCUPIED" };
  }
  return { status: "UNCERTAIN", confidence: 0.4, sourceSummary: "OBSERVATION_CONFLICT" };
}
