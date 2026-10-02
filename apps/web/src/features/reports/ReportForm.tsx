"use client";

import type { ReportContext, ReportReason } from "@uns/contracts";
import { PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { ApiRequestError } from "@/lib/api";
import { describeEvidenceError, validateEvidenceFile } from "./evidence";
import { REPORT_REASONS, reportReasonLabel } from "./reportReasons";
import { submitReport } from "./submitReport";

export interface ReportFormProps {
  reportedUserId: string;
  context: ReportContext;
  contextMessageId?: string;
  roomId?: string;
  /** Preselected reason (e.g. SEAT_TROLLING when coming from a "guardado" seat). */
  initialReason?: ReportReason;
  /** Prefilled description the user can edit before sending. */
  initialDescription?: string;
}

const DESCRIPTION_MAX_LENGTH = 1000;

export function ReportForm({ reportedUserId, context, contextMessageId, roomId, initialReason, initialDescription }: ReportFormProps) {
  const [reason, setReason] = useState<ReportReason>(initialReason ?? REPORT_REASONS[0]!);
  const [description, setDescription] = useState((initialDescription ?? "").slice(0, DESCRIPTION_MAX_LENGTH));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ warning: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Revoke any outstanding object URL on unmount; creation/revocation on change happens in the
  // handlers below (not here) so we don't call setState synchronously from an effect body.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setFile(null);
    setPreviewUrl(null);
    setFileError(null);
    if (!selected) return;

    const validationError = validateEvidenceFile(selected);
    if (validationError) {
      setFileError(describeEvidenceError(validationError));
      event.target.value = "";
      return;
    }
    setFile(selected);
    const url = URL.createObjectURL(selected);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  function handleRemoveFile() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setFile(null);
    setPreviewUrl(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      trackEvent("report_submitted", { context, reason });
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
      <div className="flex flex-col gap-2 rounded-[14px] border border-app bg-surface p-6 text-center">
        <p className="font-display font-semibold text-main">Reporte enviado.</p>
        <p className="text-sm text-muted">Gracias por avisarnos. El equipo de moderación lo va a revisar.</p>
        {result.warning ? <p className="text-sm text-[var(--seat-uncertain)]">{result.warning}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[14px] border border-app bg-surface p-6">
      <h1 className="font-display text-lg font-semibold text-main">Reportar usuario</h1>

      <label className="flex flex-col gap-1 text-sm font-semibold text-main">
        Motivo
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          className="rounded-lg border border-app bg-surface px-3 py-2 text-base font-normal text-main sm:text-sm"
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {reportReasonLabel(r)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-main">
        Descripción
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={4}
          placeholder="Contanos qué pasó (opcional)"
          className="resize-none rounded-lg border border-app bg-surface px-3 py-2 text-base font-normal text-main sm:text-sm"
        />
        <span className="text-right text-xs font-normal text-muted">
          {description.length}/{DESCRIPTION_MAX_LENGTH}
        </span>
      </label>

      <div className="flex flex-col gap-1 text-sm font-semibold text-main">
        Foto opcional
        {previewUrl ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview of the picked file, not a build-time asset */}
            <img src={previewUrl} alt="" className="h-28 w-28 rounded-xl border border-app object-cover" />
            <button
              type="button"
              onClick={handleRemoveFile}
              aria-label="Quitar foto"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-app bg-surface text-muted hover:text-main"
            >
              <XIcon aria-hidden="true" size={14} weight="bold" />
            </button>
          </div>
        ) : (
          <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-app text-muted hover:bg-[var(--surface-2)]">
            <PlusIcon aria-hidden="true" size={20} />
            <span className="text-xs font-normal">Agregar foto</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        )}
        {fileError ? <span className="text-xs font-normal text-red-600">{fileError}</span> : null}
      </div>

      <p className="text-xs text-muted">La evidencia sólo será visible para moderación.</p>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Enviar reporte"}
      </button>
    </form>
  );
}
