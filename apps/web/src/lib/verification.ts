import type { LocationInput, PhotoVerificationResultDto } from "@sala/contracts";
import { apiFetch, apiPost } from "./api";

export interface VerificationStatus {
  enabled: boolean;
}

/** GET /verification/status — whether the seat photo verifier is configured. */
export function getVerificationStatus(): Promise<VerificationStatus> {
  return apiFetch<VerificationStatus>("/api/v1/verification/status");
}

export interface CapturedPhoto {
  mimeType: "image/jpeg";
  base64: string;
}

/** POST /checkins/:id/photo */
export function uploadSeatPhoto(checkInId: string, image: CapturedPhoto, location: LocationInput): Promise<PhotoVerificationResultDto> {
  return apiPost<PhotoVerificationResultDto>(`/api/v1/checkins/${checkInId}/photo`, { image, location });
}
