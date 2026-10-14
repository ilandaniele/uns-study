import type { SeatDisputeDto } from "@sala/contracts";
import { apiFetch } from "./api";

/** GET /disputes/:id — viewer-specific detail (includes `myVote`/`iAmIncumbent`/`iAmOpener`). */
export function getDispute(disputeId: string): Promise<SeatDisputeDto> {
  return apiFetch<SeatDisputeDto>(`/api/v1/disputes/${disputeId}`);
}
