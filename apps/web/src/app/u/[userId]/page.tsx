"use client";

import type { ProfileFrameId, PublicProfileDto } from "@sala/contracts";
import { ArrowRightIcon, ArrowUpRightIcon, BookOpenIcon, ChatCircleIcon, InstagramLogoIcon, PlantIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { AdminTag } from "@/components/AdminBadge";
import { avatarRingShadow } from "@/components/avatar-ring";
import { frameOf, nameColorStyle } from "@/components/flair";
import { PhotoViewer } from "@/components/PhotoViewer";
import { apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { conversationErrorMessage, startConversation } from "@/features/chat/start-conversation";
import { openChatWidget } from "@/features/chat/widget-store";
import { useSession } from "@/lib/auth-client";
import { instagramHref } from "@/features/profile/instagram";
import { ProfileActionsMenu } from "@/features/profile/ProfileActionsMenu";
import { ProfileAdminAction } from "@/features/profile/ProfileAdminAction";
import { AdminProfileDetails } from "@/features/profile/AdminProfileDetails";
import { useMe } from "@/lib/me-store";
import { PublicAchievements } from "@/features/badges/AchievementCollection";
import { PublicModerationActions } from "@/features/admin/PublicModerationActions";
import { FriendAction } from "@/features/friends/FriendAction";

/** Public profile view: "Enviar mensaje", "Bloquear"/"Desbloquear", "Reportar". */
export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const { data: session, isPending: sessionPending } = useSession();
  const { me } = useMe();

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
        <BackButton fallbackHref="/personas" showLabel />
        <p className="p-6 text-center text-muted">Iniciá sesión para ver este perfil.</p>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="mx-auto max-w-lg p-4">
        <BackButton fallbackHref="/personas" showLabel />
        {!me?.roles.includes("ADMIN") ? <p className="p-6 text-center text-red-600">{error ?? "No encontramos ese perfil."}</p> : null}
        <AdminProfileDetails userId={userId} />
      </main>
    );
  }

  const isSelf = session.user.id === userId;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 sm:pt-8">
      <div className="mb-5"><BackButton fallbackHref="/personas" showLabel /></div>
      <article aria-labelledby="profile-name" className="rounded-3xl border border-app bg-surface p-5 sm:p-8">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-4 sm:items-center">
            <PersonAvatar name={profile.displayName} avatarUrl={profile.avatarUrl} proBadge={profile.proBadge} frame={frameOf(profile.flair)} />
            <div className="col-span-3 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 id="profile-name" className="text-xl font-bold leading-tight [overflow-wrap:anywhere] sm:text-2xl" style={nameColorStyle(profile.flair)}>
                  {profile.displayName}
                </h1>
                {profile.adminBadge ? <AdminTag kind={profile.adminBadge} /> : null}
              </div>
            </div>
          {!isSelf ? <ProfileActionsMenu userId={userId} blocked={profile.blockedByMe} busy={busy} onBlockToggle={() => void handleBlockToggle()} /> : null}
        </div>

        {profile.career || profile.currentSubject ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {profile.career ? <Chip>{profile.career}</Chip> : null}
            {profile.currentSubject ? <Chip>{profile.currentSubject}</Chip> : null}
          </div>
        ) : null}

        {profile.bio ? <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed text-main">{profile.bio}</p> : null}
        {profile.adminBadge ? <p className="mt-4 text-sm leading-relaxed text-muted">{profile.adminBadge === "SUPERADMIN" ? "Creador y desarrollador de Sala de Estudio. Propietario de la aplicación." : "Administrador de la sala: colabora con las actualizaciones de lugares y la moderación de la comunidad."}</p> : null}

        {profile.instagram || profile.studentNumber ? <dl className="mt-5 grid gap-3 border-t border-app pt-4 text-sm text-muted sm:grid-cols-2">
          {profile.instagram ? (
            <div className="min-w-0">
              <dt className="sr-only">Instagram</dt>
              <dd>{instagramHref(profile.instagram) ? <a href={instagramHref(profile.instagram)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-2 font-semibold text-primary hover:underline underline-offset-4"><InstagramLogoIcon aria-hidden="true" size={20} className="shrink-0" /><span className="truncate">@{profile.instagram.replace(/^@/, "")}</span><ArrowUpRightIcon aria-hidden="true" size={16} className="shrink-0" /></a> : profile.instagram}</dd>
            </div>
          ) : null}
          {profile.studentNumber ? (
            <div>
              <dt className="text-xs">Legajo</dt>
              <dd className="mt-1 break-words font-mono text-main">{profile.studentNumber}</dd>
            </div>
          ) : null}
        </dl> : null}

        {profile.studyStatus ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
            <BookOpenIcon aria-hidden="true" size={20} className="shrink-0 text-primary" />
            <p className="min-w-0 whitespace-pre-wrap break-words text-main"><span className="font-semibold">En modo estudio</span>{profile.studyStatus.subject ? ` · ${profile.studyStatus.subject}` : ""}
              {profile.studyStatus.message ? <span className="mt-1 block text-muted">{profile.studyStatus.message}</span> : null}
            </p>
          </div>
        ) : null}

        {actionMessage ? <p role="alert" className="mt-4 text-sm text-[var(--seat-occupied)]">{actionMessage}</p> : null}

        {!isSelf ? (
          <div className="mt-6 flex flex-wrap items-start gap-3 border-t border-app pt-5">
            {!profile.blockedByMe ? <FriendAction target={profile.friendTarget ?? { kind: "user", userId }} name={profile.displayName}/> : null}
            <button
              type="button"
              onClick={() => void handleMessage()}
              disabled={busy || !profile.allowsDirectMessages || profile.blockedByMe}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 sm:w-auto"
            >
              <ChatCircleIcon aria-hidden="true" size={20} />Enviar mensaje
            </button>
            {profile.blockedByMe ? <p className="mt-3 text-xs text-muted">Bloqueaste este perfil. Podés desbloquearlo desde el menú de opciones.</p>
              : !profile.allowsDirectMessages ? <p className="mt-3 text-xs text-muted">Esta persona no recibe mensajes directos.</p> : null}
          </div>
        ) : null}
        <ProfileAdminAction userId={userId} displayName={profile.displayName} onGranted={load} />
      </article>
      <AdminProfileDetails userId={userId} />
      <PublicModerationActions userId={userId} displayName={profile.displayName}/>
      {!profile.blockedByMe ? <PublicAchievements key={userId} userId={userId}/> : null}
      {!profile.blockedByMe ? <Link href={`/u/${encodeURIComponent(userId)}/jardin`} className="group mt-4 flex min-h-24 items-center gap-4 rounded-3xl border border-app bg-surface px-5 py-5 transition-colors hover:bg-surface-2 sm:px-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-primary"><PlantIcon aria-hidden="true" size={26} /></span>
        <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-main">{isSelf ? "Mi jardín" : "Visitar jardín"}</span><span className="mt-1 block text-sm leading-relaxed text-muted">Un rincón de árboles nativos que crece con el estudio.</span></span>
        <ArrowRightIcon aria-hidden="true" size={20} className="shrink-0 text-primary transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
      </Link> : null}
    </main>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className="max-w-full break-words rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">{children}</span>
  );
}

function PersonAvatar({ name, avatarUrl, proBadge = false, frame }: { name: string; avatarUrl: string | null; proBadge?: boolean; frame?: ProfileFrameId }) {
  const boxShadow = avatarRingShadow({ proBadge, frame });
  const [viewing, setViewing] = useState(false);
  if (avatarUrl) {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewing(true)}
          aria-label={`Ver foto de ${name}`}
          style={{ boxShadow }}
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
    <span style={{ boxShadow }} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-display text-2xl font-semibold text-main">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
