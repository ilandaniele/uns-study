"use client";

import type { ConversationDto, PublicProfileDto } from "@uns/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

/** Public profile view: "Enviar mensaje", "Bloquear"/"Desbloquear", "Reportar". */
export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();
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
      const conversation = await apiPost<ConversationDto>("/api/v1/conversations", { userId });
      router.push(`/chat/dm/${conversation.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "DM_NOT_ALLOWED") {
        setActionMessage("Esta persona no acepta mensajes directos.");
      } else if (err instanceof ApiRequestError && err.code === "BLOCKED") {
        setActionMessage("No podés enviarle mensajes a esta persona.");
      } else {
        setActionMessage("No pudimos iniciar la conversación.");
      }
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
    return <main className="p-6 text-center text-slate-500">Cargando…</main>;
  }

  if (!session?.user) {
    return <main className="p-6 text-center text-slate-600">Iniciá sesión para ver este perfil.</main>;
  }

  if (error || !profile) {
    return <main className="p-6 text-center text-red-600">{error ?? "No encontramos ese perfil."}</main>;
  }

  const isSelf = session.user.id === userId;

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-5 p-4">
      <div className="flex items-center gap-4">
        <PersonAvatar name={profile.displayName} avatarUrl={profile.avatarUrl} />
        <div>
          <h1 className="text-xl font-bold text-slate-900">{profile.displayName}</h1>
          {profile.career ? <p className="text-sm text-slate-500">{profile.career}</p> : null}
        </div>
      </div>

      {profile.bio ? <p className="text-sm text-slate-700">{profile.bio}</p> : null}

      <dl className="grid grid-cols-1 gap-2 text-sm text-slate-600">
        {profile.currentSubject ? (
          <div>
            <dt className="inline font-medium">Cursando: </dt>
            <dd className="inline">{profile.currentSubject}</dd>
          </div>
        ) : null}
        {profile.instagram ? (
          <div>
            <dt className="inline font-medium">Instagram: </dt>
            <dd className="inline">@{profile.instagram}</dd>
          </div>
        ) : null}
        {profile.studentNumber ? (
          <div>
            <dt className="inline font-medium">Legajo: </dt>
            <dd className="inline">{profile.studentNumber}</dd>
          </div>
        ) : null}
      </dl>

      {profile.studyStatus ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          En Modo Estudio{profile.studyStatus.subject ? `: ${profile.studyStatus.subject}` : ""}
          {profile.studyStatus.message ? ` — ${profile.studyStatus.message}` : ""}
        </p>
      ) : null}

      {actionMessage ? <p className="text-sm text-red-600">{actionMessage}</p> : null}

      {!isSelf ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleMessage()}
            disabled={busy || !profile.allowsDirectMessages || profile.blockedByMe}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Enviar mensaje
          </button>
          <button
            type="button"
            onClick={() => void handleBlockToggle()}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {profile.blockedByMe ? "Desbloquear" : "Bloquear"}
          </button>
          <Link
            href={`/reportar/${userId}?context=PROFILE`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reportar
          </Link>
        </div>
      ) : null}
    </main>
  );
}

function PersonAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external HTTPS URLs, not a build-time asset
    return <img src={avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-600">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
