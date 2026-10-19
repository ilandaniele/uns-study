"use client";

import { UserCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { identityAlreadyVisible, markIdentityAsked, promptName, shouldAskIdentity } from "./identity-prompt";
import { useMyProfile } from "./useMyProfile";

interface AccountUser {
  id: string;
  name: string;
  image: string | null;
}

/**
 * Asks a signed-in user once (per browser) whether to show their name and photo instead of the
 * random animal alias. "Ahora no" keeps them hidden and shows the short guide to do it later.
 * The profile is only fetched while the question is still pending, so returning visitors cost nothing.
 */
export function IdentityPrompt({ user, blocked }: { user: AccountUser | null; blocked: boolean }) {
  const [pending, setPending] = useState(false);
  const userId = user?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage after mount
    setPending(userId != null && shouldAskIdentity(userId));
  }, [userId]);
  const done = useCallback(() => setPending(false), []);
  if (!user || !pending || blocked) return null;
  return <IdentityPromptDialog user={user} onDone={done} />;
}

function IdentityPromptDialog({ user, onDone }: { user: AccountUser; onDone: () => void }) {
  const { profile, privacy, loading, saveProfile, savePrivacy } = useMyProfile();
  const [step, setStep] = useState<"ask" | "guide">("ask");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loaded = profile != null && privacy != null;
  const skip = loaded && identityAlreadyVisible(profile, privacy);
  const failed = !loading && !loaded;
  useEffect(() => {
    // Already visible: never ask on this browser. Load failure: drop it for now, ask on a later visit.
    if (skip) markIdentityAsked(user.id);
    if (skip || failed) onDone();
  }, [skip, failed, user.id, onDone]);

  const close = useCallback(() => {
    markIdentityAsked(user.id);
    onDone();
  }, [user.id, onDone]);
  const visible = loaded && !skip;
  useFocusTrap(panelRef, { onEscape: close, active: visible });
  if (!visible) return null;

  const { firstName, lastName } = promptName(profile, user.name);
  const photo = profile.avatarUrl ?? user.image;
  const fullName = `${firstName} ${lastName}`.trim();
  const alias = profile.alias ?? "Usuario anónimo";

  async function accept() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      // No stored photo yet: copy the sign-in account's picture, the one previewed above.
      if (!profile.avatarUrl && user.image) await apiPost("/api/v1/profiles/me/avatar/google");
      const named = await saveProfile({
        identityMode: "FULL_NAME",
        ...(profile.firstName ? {} : { firstName: firstName || null, lastName: lastName || null }),
      });
      const shown = named && (await savePrivacy({ showAvatar: true }));
      if (!shown) throw new Error("save failed");
      close();
    } catch {
      setError("No pudimos guardar. Probá de nuevo o hacelo desde tu perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="backdrop-enter fixed inset-0 z-[65] flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-prompt-title"
        tabIndex={-1}
        className="dialog-enter w-full rounded-t-2xl border border-app bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 shadow-xl outline-none sm:max-w-sm sm:rounded-2xl sm:pb-5"
      >
        {step === "ask" ? (
          <>
            <h2 id="identity-prompt-title" className="text-lg font-semibold text-main">
              ¿Querés mostrar tu nombre?
            </h2>
            <p className="mt-1 text-sm text-muted">Ahora aparecés como “{alias}”. Si aceptás, los demás te ven así:</p>
            <div className="mt-4 flex items-center gap-3 rounded-control border border-app p-3">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote avatar preview, sized by CSS
                <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserCircleIcon size={48} className="shrink-0 text-muted" aria-hidden="true" />
              )}
              <span className="min-w-0 truncate text-base font-semibold text-main">{fullName || "Tu nombre"}</span>
            </div>
            {error ? (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setStep("guide")}
                disabled={saving}
                className="min-h-11 rounded-control border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={() => void accept()}
                disabled={saving}
                className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Sí, mostrar mi nombre"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="identity-prompt-title" className="text-lg font-semibold text-main">
              Seguís como “{alias}”
            </h2>
            <p className="mt-1 text-sm text-muted">Si más adelante querés mostrar tu nombre y foto:</p>
            <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
              <li>
                Entrá a{" "}
                <Link href="/perfil" onClick={close} className="font-medium text-primary hover:underline">
                  Perfil
                </Link>
                .
              </li>
              <li>En “¿Cómo te ven otras personas?” elegí “Nombre completo” y tocá Guardar.</li>
              <li>En “Foto de perfil” subí una foto o usá la de Google.</li>
              <li>En Privacidad activá “Mostrar foto de perfil”.</li>
            </ol>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.98]"
              >
                Entendido
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
