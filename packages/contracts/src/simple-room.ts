import { z } from "zod";
import type { CheckInDto } from "./index";

export const roomModeSchema = z.object({ mode: z.enum(["COMMON", "SIMPLE"]) }).strict();
export type RoomModeDto = z.infer<typeof roomModeSchema>;

const anchorSchema = z.object({
  seatId: z.string().uuid(),
  latitude: z.number().min(-85).max(85),
  longitude: z.number().min(-180).max(180),
}).strict();

/** Measured references, not a phone's approximate room-center fix. No guessed defaults. */
export const seatCalibrationSchema = z.object({
  anchors: z.tuple([anchorSchema, anchorSchema, anchorSchema]),
  uncertaintyM: z.number().min(0.1).max(20),
  source: z.string().trim().min(5).max(500),
}).strict();
export type SeatCalibrationInput = z.infer<typeof seatCalibrationSchema>;
export interface SeatCalibrationDto {
  calibration: SeatCalibrationInput | null;
  matchesLayout: boolean;
  updatedAt: string | null;
  positions: { seatId: string; latitude: number; longitude: number }[];
}

export type SimpleConfirmationReason = "CALIBRATION_REQUIRED" | "LAYOUT_CHANGED" | "AMBIGUOUS" | "OUTSIDE_CALIBRATED_AREA" | "NO_FREE_SEAT" | "NEAREST_UNAVAILABLE";
export type SimpleCheckInResult =
  | { outcome: "CHECKED_IN" | "ALREADY_CHECKED_IN"; checkIn: CheckInDto }
  | { outcome: "CONFIRM"; reason: SimpleConfirmationReason; suggestedSeatId: string | null; candidateSeatIds: string[]; accuracyM: number };
