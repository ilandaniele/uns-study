"use client";

import type { AvatarMimeType } from "@uns/contracts";
import { useRef, useState } from "react";
import { apiDelete, apiPost, ApiRequestError } from "@/lib/api";
import { AVATAR_OUTPUT_SIZE, base64FromDataUrl, centerSquareCrop } from "./avatar-image";

export interface AvatarUploaderProps {
  avatarUrl: string | null;
  displayName: string;
  /** Better Auth's `session.user.image` (Google sign-in photo), when present. */
  googleImage: string | null;
  showAvatar: boolean;
  onAvatarUrlChange: (avatarUrl: string | null) => void;
  onEnableShowAvatar: () => void;
}

const OUTPUT_MIME: AvatarMimeType = "image/jpeg";

/** Resizes/crops `file` to a centered `AVATAR_OUTPUT_SIZE`x`AVATAR_OUTPUT_SIZE` JPEG via canvas. */
async function resizeToAvatar(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No pudimos leer la imagen."));
      img.src = objectUrl;
    });

    const { sx, sy, size } = centerSquareCrop(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No pudimos procesar la imagen.");
    ctx.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);

    return base64FromDataUrl(canvas.toDataURL(OUTPUT_MIME, 0.85));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** "Foto de perfil" section on `/perfil`: upload/crop, reuse the Google photo, or remove it. */
export function AvatarUploader({ avatarUrl, displayName, googleImage, showAvatar, onAvatarUrlChange, onEnableShowAvatar }: AvatarUploaderProps) {
  const [busy, setBusy] = useState(false);
  // Bumped after every successful change so the preview refetches even if the URL (content hash) is unchanged.
  const [bust, setBust] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const base64 = await resizeToAvatar(file);
      const result = await apiPost<{ avatarUrl: string }>("/api/v1/profiles/me/avatar", { mimeType: OUTPUT_MIME, base64 });
      onAvatarUrlChange(result.avatarUrl);
      setBust((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === "RATE_LIMITED" ? "Demasiados intentos, esperá un momento." : "No pudimos subir la foto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUseGoogle() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ avatarUrl: string }>("/api/v1/profiles/me/avatar/google");
      onAvatarUrlChange(result.avatarUrl);
      setBust((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.message ? `No pudimos usar tu foto de Google: ${err.message}` : "No pudimos usar tu foto de Google.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await apiDelete("/api/v1/profiles/me/avatar");
      onAvatarUrlChange(null);
    } catch {
      setError("No pudimos quitar la foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <AvatarPreview avatarUrl={avatarUrl ? `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}r=${bust}` : null} name={displayName} />
        <div className="flex flex-wrap gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFileChange(e)} />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Subir foto
          </button>
          {googleImage ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleUseGoogle()}
              className="min-h-11 rounded-lg border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              Usar mi foto de Google
            </button>
          ) : null}
          {avatarUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove()}
              className="min-h-11 rounded-lg border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              Quitar
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {!showAvatar ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-muted">
          <span>Tu foto no se muestra: activá &ldquo;Mostrar foto de perfil&rdquo; más abajo.</span>
          <button type="button" onClick={onEnableShowAvatar} className="relative font-semibold text-primary underline-offset-2 hover:underline before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']">
            Activar ahora
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AvatarPreview({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- relative/https avatar URL, not a build-time asset
    return <img src={avatarUrl} alt="" className="h-[72px] w-[72px] shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-display text-2xl font-semibold text-main">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
