import { quietRoomOccupancyPct, type QuietRoomAlertEvent, type QuietRoomThreshold, type RoomSummary } from "@sala/contracts";

export const QUIET_THRESHOLD_META: Record<QuietRoomThreshold, { label: string; hint: string }> = {
  30: { label: "Bastante vacía", hint: "30 % ocupada o menos" },
  50: { label: "A la mitad", hint: "50 % o menos" },
  70: { label: "Con lugar", hint: "70 % o menos" },
};

/** True when the room is already at or below `t` %: the alert only fires on a downward crossing, so it'd never trigger now. */
export function thresholdAlreadyMet(summary: RoomSummary, t: QuietRoomThreshold): boolean {
  const pct = quietRoomOccupancyPct(summary);
  return pct !== null && pct <= t;
}

export function quietToastMessage(e: QuietRoomAlertEvent): string {
  return `La sala bajó al ${e.occupancyPct} % ocupada: hay ${e.free} lugares libres.`;
}
