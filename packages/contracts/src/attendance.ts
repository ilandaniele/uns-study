export const STUDY_PRESENCE_LEASE_MS = 5 * 60_000;
export const STUDY_ABSENCE_RELEASE_MS = 60 * 60_000;
export interface StudyPresenceDto {
  checkInId: string;
  state: "COUNTING" | "PAUSED" | "AWAY" | "RELEASED";
  verifiedUntil: string;
  releaseAt: string | null;
  trackingHere?: boolean;
}
