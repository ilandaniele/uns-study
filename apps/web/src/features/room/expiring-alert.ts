import type { CheckInDto, CheckInExpiringEvent } from "@uns/contracts";

/**
 * True when a `checkin:expiring` event is about the caller's *current* check-in in its current
 * form: extending changes `expiresAt`, which silences a stale alert without any extra state.
 */
export function isExpiringAlertFor(event: CheckInExpiringEvent | null, checkIn: Pick<CheckInDto, "id" | "expiresAt">): boolean {
  return event !== null && event.checkInId === checkIn.id && new Date(event.expiresAt).getTime() === new Date(checkIn.expiresAt).getTime();
}
