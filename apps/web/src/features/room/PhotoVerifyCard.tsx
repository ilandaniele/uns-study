"use client";

import { CameraIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState } from "react";
import { describeActionError } from "@/lib/errors";
import { getFreshLocation } from "@/lib/geolocation";
import { compressPhotoForUpload } from "@/lib/photo";
import { getVerificationStatus, uploadSeatPhoto } from "@/lib/verification";

const REASON_COPY: Record<string, string> = {
  SEAT_MISMATCH: "No pudimos confirmar que la foto es de este lugar. Probá sacarla de nuevo, bien de frente al asiento.",
  LOW_CONFIDENCE: "No estamos seguros con esta foto. Probá con mejor luz o más de frente.",
  NO_PREDICTION: "No pudimos identificar el lugar en la foto. Probá sacarla de nuevo.",
  VERIFIER_ERROR: "No pudimos verificar la foto ahora. Podés volver a intentarlo en un momento.",
};

export interface PhotoVerifyCardProps {
  checkInId: string;
  /** Called after any upload attempt that reached the server (verified or not) — refetches /me. */
  onChanged: () => void;
}

/** "Verificá tu lugar con una foto" card shown on the caller's own seat when it isn't currently
 *  photo-verified. Hidden entirely when the seat verifier isn't configured (GET /verification/status). */
export function PhotoVerifyCard({ checkInId, onChanged }: PhotoVerifyCardProps) {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getVerificationStatus()
      .then((status) => {
        if (!cancelled) setEnabled(status.enabled);
      })
      .catch(() => {
        // Unknown status: stay hidden rather than offering a button that will just fail.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  async function handleFile(file: File) {
    setPending(true);
    setMessage(null);
    try {
      const [image, location] = await Promise.all([compressPhotoForUpload(file), getFreshLocation()]);
      const result = await uploadSeatPhoto(checkInId, image, location);
      if (result.verified) {
        setMessage({ tone: "success", text: "¡Listo! Tu lugar quedó verificado con foto." });
      } else {
        setMessage({ tone: "error", text: REASON_COPY[result.reason] ?? "No pudimos verificar la foto." });
      }
      onChanged();
    } catch (error) {
      setMessage({ tone: "error", text: describeActionError(error) });
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-app pt-3">
      <p className="text-sm font-semibold text-main">Verificá tu lugar con una foto</p>
      <p className="text-sm text-muted">
        Sacá una foto desde tu asiento mirando hacia adelante. Mientras esté verificado, nadie puede marcarlo como libre ni abrir
        una votación por 2 horas (o hasta que termine tu tiempo marcado).
      </p>
      {message ? (
        <p role="status" className={`text-sm ${message.tone === "success" ? "text-[var(--seat-free)]" : "text-red-700"}`}>
          {message.text}
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="flex min-h-11 items-center justify-center gap-2 rounded-control border-2 border-[var(--primary)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
      >
        <CameraIcon aria-hidden="true" size={18} weight="bold" />
        {pending ? "Verificando…" : "Sacar foto"}
      </button>
    </div>
  );
}
