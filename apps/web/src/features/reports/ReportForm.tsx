"use client";

import type { ReportContext, ReportReason } from "@uns/contracts";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { ApiRequestError } from "@/lib/api";
import { describeEvidenceError, validateEvidenceFile } from "./evidence";
import { REPORT_REASONS, reportReasonLabel } from "./reportReasons";
import { submitReport } from "./submitReport";

export interface ReportFormProps {
  reportedUserId: string;
  context: ReportContext;
  contextMessageId?: string;
  roomId?: string;
}

const DESCRIPTION_MAX_LENGTH = 1000;

export function ReportForm({ reportedUserId, context, contextMessageId, roomId }: ReportFormProps) {
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]!);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ warning: string | null } | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(null);
    setFileError(null);
    if (!selected) return;

    const validationError = validateEvidenceFile(selected);
    if (validationError) {
      setFileError(describeEvidenceError(validationError));
      event.target.value = "";
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { attachmentWarning } = await submitReport({
        reportedUserId,
        reason,
        description: description.trim(),
        context,
        contextMessageId,
        roomId,
        file,
      });
      setResult({ warning: attachmentWarning });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "RATE_LIMITED") {
        setError("Ya enviaste varios reportes hoy. Probá de nuevo más tarde.");
      } else if (err instanceof ApiRequestError && err.code === "VALIDATION_ERROR") {
        setError("No pudimos enviar el reporte con esos datos.");
      } else {
        setError("No pudimos enviar el reporte. Intentá de nuevo.");
      }
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="font-semibold text-slate-900">Reporte enviado.</p>
        <p className="text-sm text-slate-600">Gracias por avisarnos. El equipo de moderación lo va a revisar.</p>
        {result.warning ? <p className="text-sm text-amber-600">{result.warning}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-bold text-slate-900">Reportar usuario</h1>

      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
        Motivo
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {reportReasonLabel(r)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
        Descripción
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={4}
          placeholder="Contanos qué pasó (opcional)"
          className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
        />
        <span className="text-right text-xs font-normal text-slate-400">
          {description.length}/{DESCRIPTION_MAX_LENGTH}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
        Foto opcional
        <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="text-sm font-normal" />
        {file ? <span className="text-xs font-normal text-slate-500">{file.name}</span> : null}
        {fileError ? <span className="text-xs font-normal text-red-600">{fileError}</span> : null}
      </label>

      <p className="text-xs text-slate-400">La evidencia sólo será visible para moderación.</p>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Enviar reporte"}
      </button>
    </form>
  );
}
