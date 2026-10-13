"use client";

import type { PublicProfileDto } from "@sala/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { WithAdminBadge } from "@/components/AdminBadge";
import { PhotoViewer } from "@/components/PhotoViewer";
import { apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { conversationErrorMessage, startConversation } from "@/features/chat/start-conversation";
import { openChatWidget } from "@/features/chat/widget-store";
import { useSession } from "@/lib/auth-client";

/** Public profile view: "Enviar mensaje", "Bloquear"/"Desbloquear", "Reportar". */
export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const { data: session, isPending: sessionPending } = useSession();

  const [profile, setProfile] = useState<PublicProfileDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dto = await apiFetch<PublicProfileDto>(`/api/v1/profiles/${userId}`);
      setProfile(dto);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError && err.code === "NOT_FOUND" ? "No encontramos ese perfil." : "No pudimos cargar el perfil.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount/param change
    void load();
  }, [load]);

  async function handleMessage() {
    setBusy(true);
    setActionMessage(null);
    try {
      const conversation = await startConversation(userId);
      openChatWidget({ view: "dm", conversationId: conversation.id, conversation });
    } catch (err) {
      setActionMessage(conversationErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBlockToggle() {
    if (!profile) return;
    setBusy(true);
    setActionMessage(null);
    try {
      if (profile.blockedByMe) {
        await apiFetch(`/api/v1/users/${userId}/block`, { method: "DELETE" });
      } else {
        await apiPost(`/api/v1/users/${userId}/block`);
      }
      await load();
    } catch {
      setActionMessage("No pudimos actualizar el bloqueo.");
    } finally {
      setBusy(false);
    }
  }

  if (sessionPending || loading) {
    return <main className="p-6 text-center text-muted">Cargando…</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-lg p-4">
        <BackButton fallbackHref="/personas" />
        <p className="p-6 text-center text-muted">Iniciá sesión para ver este perfil.</p>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="mx-auto max-w-lg p-4">
        <BackButton fallbackHref="/personas" />
        <p className="p-6 text-center text-red-600">{error ?? "No encontramos ese perfil."}</p>
      </main>
    );
  }

  const isSelf = session.user.id === userId;

  return (
    <main className="mx-auto max-w-lg p-4">
      <BackButton fallbackHref="/personas" />
      <div className="border-t border-app pt-5">
        <div className="flex items-center gap-4">
          <WithAdminBadge show={profile.adminBadge} size={64}>
            <PersonAvatar name={profile.displayName} avatarUrl={profile.avatarUrl} />
          </WithAdminBadge>
          <div className="min-w-0">
            <h1 className="truncate t-title text-xl">{profile.displayName}</h1>
            {profile.career || profile.currentSubject ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {profile.career ? <Chip>{profile.career}</Chip> : null}
                {profile.currentSubject ? <Chip>{profile.currentSubject}</Chip> : null}
              </div>
            ) : null}
          </div>
        </div>

        {profile.bio ? <p className="mt-4 whitespace-pre-wrap break-words text-sm text-main">{profile.bio}</p> : null}

        <dl className="mt-3 flex flex-col gap-1 text-sm text-muted">
          {profile.instagram ? (
            <div>
              <dt className="inline font-medium text-main">Instagram: </dt>
              <dd className="inline">@{profile.instagram}</dd>
            </div>
          ) : null}
          {profile.studentNumber ? (
            <div>
              <dt className="inline font-medium text-main">Legajo: </dt>
              <dd className="inline font-mono">{profile.studentNumber}</dd>
            </div>
          ) : null}
        </dl>

        {profile.studyStatus ? (
          <p className="mt-4 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-sm text-main whitespace-pre-wrap break-words">
            En Modo Estudio{profile.studyStatus.subject ? `: ${profile.studyStatus.subject}` : ""}
            {profile.studyStatus.message ? <span className="mt-1 block text-muted">{profile.studyStatus.message}</span> : null}
          </p>
        ) : null}

        {actionMessage ? <p className="mt-4 text-sm text-red-600">{actionMessage}</p> : null}

        {!isSelf ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleMessage()}
              disabled={busy || !profile.allowsDirectMessages || profile.blockedByMe}
              className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              Enviar mensaje
            </button>
            <button
              type="button"
              onClick={() => void handleBlockToggle()}
              disabled={busy}
              className="min-h-11 rounded-lg border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {profile.blockedByMe ? "Desbloquear" : "Bloquear"}
            </button>
            <Link
              href={`/reportar/${userId}?context=PROFILE`}
              className="flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-semibold text-[var(--seat-occupied)] hover:bg-[var(--surface-2)]"
            >
              Reportar
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-control border border-app px-2 py-0.5 text-xs font-medium text-muted">{children}</span>
  );
}

function PersonAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [viewing, setViewing] = useState(false);
  if (avatarUrl) {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewing(true)}
          aria-label={`Ver foto de ${name}`}
          className="shrink-0 cursor-zoom-in rounded-full transition-transform duration-150 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external HTTPS URLs, not a build-time asset */}
          <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        </button>
        {viewing ? <PhotoViewer src={avatarUrl} alt={`Foto de ${name}`} onClose={() => setViewing(false)} /> : null}
      </>
    );
  }
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-display text-2xl font-semibold text-main">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
