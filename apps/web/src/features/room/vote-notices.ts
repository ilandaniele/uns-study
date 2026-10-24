import type { CheckInDto, DisputeVoteAvailableEvent } from "@sala/contracts";

export function eligibleVoteNotice(event: DisputeVoteAvailableEvent, checkIn: Pick<CheckInDto, "roomId" | "seatId" | "expiresAt"> | null, now: number): boolean {
  return checkIn != null && checkIn.roomId === event.roomId && checkIn.seatId !== event.seatId
    && Date.parse(checkIn.expiresAt) > now && Date.parse(event.closesAt) > now;
}
