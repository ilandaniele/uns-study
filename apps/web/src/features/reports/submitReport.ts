import { createReportSchema } from "@sala/contracts";
import type { ReportContext, ReportCreatedDto, ReportReason, UploadInstructionDto } from "@sala/contracts";
import { apiPost, ApiRequestError } from "@/lib/api";
import type { EvidenceFileLike } from "./evidence";

export interface SubmitReportInput {
  reportedUserId: string;
  reason: ReportReason;
  description?: string;
  context: ReportContext;
  contextMessageId?: string;
  roomId?: string;
  file?: (EvidenceFileLike & Blob) | null;
}

export interface SubmitReportResult {
  report: ReportCreatedDto;
  /** Non-null when the report itself succeeded but the photo could not be attached. */
  attachmentWarning: string | null;
}

/**
 * Creates the report, then — if a photo was provided — requests an upload slot, PUTs the file
 * directly to storage, and marks it complete. A missing/disabled storage backend
 * (`STORAGE_UNAVAILABLE`) does not fail the report: it's submitted without the photo.
 */
export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const report = await apiPost<ReportCreatedDto>(`/api/v1/users/${input.reportedUserId}/reports`, {
    reason: input.reason,
    description: input.description || undefined,
    context: input.context,
    contextMessageId: input.contextMessageId || undefined,
    roomId: input.roomId || undefined,
  }, createReportSchema);

  if (!input.file) {
    return { report, attachmentWarning: null };
  }

  try {
    const instruction = await apiPost<UploadInstructionDto>(`/api/v1/reports/${report.id}/attachments`, {
      contentType: input.file.type,
      sizeBytes: input.file.size,
    });

    const uploadRes = await fetch(instruction.uploadUrl, {
      method: instruction.method,
      headers: instruction.headers,
      body: input.file,
    });
    if (!uploadRes.ok) throw new Error("upload failed");

    await apiPost(`/api/v1/reports/${report.id}/attachments/${instruction.attachmentId}/complete`);
    return { report, attachmentWarning: null };
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === "STORAGE_UNAVAILABLE") {
      return { report, attachmentWarning: "El reporte se envió sin la foto: el almacenamiento no está disponible por ahora." };
    }
    return { report, attachmentWarning: "El reporte se envió, pero no pudimos adjuntar la foto." };
  }
}
