"use client";

import type { StudyStatusDto } from "@uns/contracts";
import { useState } from "react";
import { apiFetch, apiPost, ApiRequestError } from "@/lib/api";

export interface StudyModeControlProps {
  roomId: string;
  initialStatus: StudyStatusDto | null;
}

/** "Modo Estudio" toggle: lets the caller broadcast a subject/message without being seated (§ B1 /study/start). */
export function StudyModeControl({ roomId, initialStatus }: StudyModeControlProps) {
  const [status, setStatus] = useState(initialStatus);
  const [subject, setSubject] = useState(initialStatus?.subject ?? "");
  const [message, setMessage] = useState(initialStatus?.message ?? "");
  const [lookingForGroup, setLookingForGroup] = useState(initialStatus?.lookingForGroup ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const result = await apiPost<StudyStatusDto>("/api/v1/study/start", {
        roomId,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        lookingForGroup,
      });
      setStatus(result);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === "PRESENCE_REJECTED"
          ? "Necesitás estar (o haber estado hace poco) en la sala para activar el Modo Estudio."
          : "No pudimos activar el Modo Estudio.",
      );
    } finally {
      setPending(false);
    }
  }

  async function stop() {
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/v1/study/stop", { method: "POST" });
      setStatus(null);
    } catch {
      setError("No pudimos desactivar el Modo Estudio.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status ? (
        <p className="text-sm text-main">
          Modo Estudio activo{status.subject ? ` · ${status.subject}` : ""}
          {status.lookingForGroup ? " · buscando grupo" : ""}
        </p>
      ) : (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={80}
            placeholder="¿Qué estás estudiando? (opcional)"
            className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={140}
            placeholder="Mensaje corto (opcional)"
            className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-main">
            <input type="checkbox" checked={lookingForGroup} onChange={(e) => setLookingForGroup(e.target.checked)} className="h-4 w-4 accent-primary" />
            Busco grupo de estudio
          </label>
        </>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div>
        {status ? (
          <button
            type="button"
            onClick={() => void stop()}
            disabled={pending}
            className="min-h-11 rounded-full border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            Desactivar Modo Estudio
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={pending}
            className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Activar Modo Estudio
          </button>
        )}
      </div>
    </div>
  );
}
