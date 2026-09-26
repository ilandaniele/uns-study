import { REPORT_EVIDENCE_MAX_BYTES, REPORT_EVIDENCE_MIME } from "@uns/contracts";

export type EvidenceValidationError = "TOO_LARGE" | "UNSUPPORTED_TYPE";

/** Minimal shape of `File` we actually need — keeps this testable without a DOM `File`. */
export interface EvidenceFileLike {
  type: string;
  size: number;
}

/** Client-side pre-check mirroring the API's `attachmentRequestSchema`; the server re-validates regardless. */
export function validateEvidenceFile(file: EvidenceFileLike): EvidenceValidationError | null {
  if (!(REPORT_EVIDENCE_MIME as readonly string[]).includes(file.type)) return "UNSUPPORTED_TYPE";
  if (file.size > REPORT_EVIDENCE_MAX_BYTES) return "TOO_LARGE";
  return null;
}

export function describeEvidenceError(error: EvidenceValidationError): string {
  if (error === "TOO_LARGE") return "La foto supera el tamaño máximo permitido (5 MB).";
  return "Formato no admitido. Usá JPG, PNG, WEBP o HEIC.";
}
