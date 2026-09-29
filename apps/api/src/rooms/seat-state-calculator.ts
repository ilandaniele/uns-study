import type { SeatStatus } from "@uns/contracts";

export interface SeatObservationInput {
  userId: string;
  status: "FREE" | "OCCUPIED" | "SAVED";
  weight: number;
  observedAt: Date;
}

export interface SeatStateInput {
  hasActiveCheckIn: boolean;
  observations: SeatObservationInput[];
  /**
   * Present when the seat has an OPEN dispute (any kind), or a TIED dispute still linked to the
   * seat's current active check-in (cleared once the incumbent extends past `resolvedAt`).
   */
  dispute?: { status: "OPEN" | "TIED" } | null;
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
 * Priority: active check-in > active observations (FREE/OCCUPIED/SAVED/conflict) > UNKNOWN.
 * Only the latest observation per user counts (distinct users).
 */
export function calculateSeatState(input: SeatStateInput): SeatStateResult {
  // An OPEN dispute always overrides both check-in and observation signals: a vote is in
  // progress, so the seat is genuinely uncertain until it resolves.
  if (input.dispute?.status === "OPEN") {
    return { status: "UNCERTAIN", confidence: 0.5, sourceSummary: "DISPUTE" };
  }

  if (input.hasActiveCheckIn) {
    // A TIED dispute keeps the same check-in's seat uncertain until the incumbent extends.
    if (input.dispute?.status === "TIED") {
      return { status: "UNCERTAIN", confidence: 0.4, sourceSummary: "DISPUTE_TIED" };
    }
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
  const saved = latest.filter((o) => o.status === "SAVED");
  // SAVED (belongings, nobody sitting) counts as "not free" against FREE observations.
  const notFree = [...occupied, ...saved];

  if (free.length === 0 && notFree.length === 0) {
    return { status: "UNKNOWN", confidence: 0, sourceSummary: "NONE" };
  }

  if (notFree.length === 0) {
    return { status: "FREE", confidence: observationConfidence(free.length), sourceSummary: "OBSERVATION_FREE" };
  }

  const newestOf = (list: SeatObservationInput[]) => list.reduce((a, b) => (b.observedAt.getTime() > a.observedAt.getTime() ? b : a));

  if (free.length === 0) {
    if (saved.length === 0) {
      return {
        status: "OCCUPIED",
        confidence: observationConfidence(occupied.length),
        sourceSummary: "OBSERVATION_OCCUPIED",
      };
    }
    if (occupied.length === 0) {
      return { status: "SAVED", confidence: observationConfidence(saved.length), sourceSummary: "OBSERVATION_SAVED" };
    }
    // Someone says it's taken and someone says it's just belongings: the newest report decides.
    return newestOf(notFree).status === "SAVED"
      ? { status: "SAVED", confidence: 0.5, sourceSummary: "OBSERVATION_SAVED" }
      : { status: "OCCUPIED", confidence: 0.5, sourceSummary: "OBSERVATION_OCCUPIED" };
  }

  // Conflict: FREE vs not-free. Compare weighted totals; the dominant side (>= 2x the other)
  // wins only if the single newest observation also belongs to that side.
  const weightFree = free.reduce((sum, o) => sum + o.weight, 0);
  const weightNotFree = notFree.reduce((sum, o) => sum + o.weight, 0);
  const newest = newestOf(latest);

  if (weightFree >= weightNotFree * 2 && newest.status === "FREE") {
    return { status: "FREE", confidence: 0.5, sourceSummary: "OBSERVATION_CONFLICT_FREE" };
  }
  if (weightNotFree >= weightFree * 2 && newest.status === "OCCUPIED") {
    return { status: "OCCUPIED", confidence: 0.5, sourceSummary: "OBSERVATION_CONFLICT_OCCUPIED" };
  }
  if (weightNotFree >= weightFree * 2 && newest.status === "SAVED") {
    return { status: "SAVED", confidence: 0.5, sourceSummary: "OBSERVATION_CONFLICT_SAVED" };
  }
  return { status: "UNCERTAIN", confidence: 0.4, sourceSummary: "OBSERVATION_CONFLICT" };
}
