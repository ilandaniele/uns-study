import type { DisputeKind, DisputeVote, LocationInput, SeatDisputeDto } from "@uns/contracts";
import { apiFetch, apiPost } from "./api";

/** POST /disputes — opens a seat dispute ("Me senté acá" / "Esa persona no está" / "Está guardado"). */
export function openDispute(roomId: string, seatId: string, kind: DisputeKind, location: LocationInput): Promise<SeatDisputeDto> {
  return apiPost<SeatDisputeDto>("/api/v1/disputes", { roomId, seatId, kind, location });
}

/** POST /disputes/:id/votes — casts (or overwrites) the caller's PRESENT/ABSENT vote. */
export function voteDispute(disputeId: string, vote: DisputeVote, location: LocationInput): Promise<SeatDisputeDto> {
  return apiPost<SeatDisputeDto>(`/api/v1/disputes/${disputeId}/votes`, { vote, location });
}

/** GET /disputes/:id — viewer-specific detail (includes `myVote`/`iAmIncumbent`/`iAmOpener`). */
export function getDispute(disputeId: string): Promise<SeatDisputeDto> {
  return apiFetch<SeatDisputeDto>(`/api/v1/disputes/${disputeId}`);
}
