"use client";

import type { PublicProfileDto } from "@uns/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationSettings } from "@/features/notifications/NotificationSettings";
import { AvatarUploader } from "@/features/profile/AvatarUploader";
import { DeleteAccountDialog } from "@/features/profile/DeleteAccountDialog";
import { PrivacyToggles } from "@/features/profile/PrivacyToggles";
import { ProfileForm } from "@/features/profile/ProfileForm";
import { StudyModeControl } from "@/features/profile/StudyModeControl";
import { useMyProfile } from "@/features/profile/useMyProfile";
import { apiFetch, apiPost } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { invalidateMe } from "@/lib/me-store";
import { resetSocket } from "@/lib/socket";

const ROOM_SLUG = "principal";

export default function PerfilPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const { profile, privacy, loading, error, saving, saveProfile, savePrivacy, setLocalAvatarUrl, rerollAlias } = useMyProfile();
  const [studyStatus, setStudyStatus] = useState<PublicProfileDto["studyStatus"]>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void apiFetch<{ id: string }>(`/api/v1/rooms/${ROOM_SLUG}`).then((room) => setRoomId(room.id));
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    void apiFetch<PublicProfileDto>(`/api/v1/profiles/${session.user.id}`).then((pub) => setStudyStatus(pub.studyStatus));
  }, [session?.user]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiPost("/api/v1/me/delete", { confirm: "ELIMINAR" });
      await signOut();
      invalidateMe();
      resetSocket();
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  if (sessionPending || loading) {
    return <main className="p-6 text-center text-muted">Cargando…</main>;
  }

  if (!session?.user || error || !profile || !privacy) {
    return <main className="p-6 text-center text-muted">{error ?? "Iniciá sesión para ver tu perfil."}</main>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-4 pb-16">
      <div>
        <h1 className="font-display text-xl font-semibold text-main">Perfil</h1>
        <p className="text-sm text-muted">{profile.email}</p>
      </div>

      <section className="rounded-[14px] border border-app bg-surface p-4">
        <h2 className="mb-3 font-display text-base font-semibold text-main">Foto de perfil</h2>
        <AvatarUploader
          avatarUrl={profile.avatarUrl}
          displayName={session.user.name || profile.nickname || profile.firstName || "?"}
          googleImage={session.user.image ?? null}
          showAvatar={privacy.showAvatar}
          onAvatarUrlChange={setLocalAvatarUrl}
          onEnableShowAvatar={() => void savePrivacy({ showAvatar: true })}
        />
      </section>

      <section className="rounded-[14px] border border-app bg-surface p-4">
        <h2 className="mb-3 font-display text-base font-semibold text-main">Tu perfil</h2>
        <ProfileForm profile={profile} saving={saving} onSave={saveProfile} onRerollAlias={rerollAlias} />
      </section>

      <section className="rounded-[14px] border border-app bg-surface p-4">
        <h2 className="mb-1 font-display text-base font-semibold text-main">Privacidad</h2>
        <p className="mb-2 text-xs text-muted">Todo está oculto por defecto. Activá sólo lo que quieras compartir.</p>
        <PrivacyToggles privacy={privacy} saving={saving} onChange={(patch) => void savePrivacy(patch)} />
      </section>

      {roomId ? (
        <section className="rounded-[14px] border border-app bg-surface p-4">
          <h2 className="mb-3 font-display text-base font-semibold text-main">Modo estudio</h2>
          <StudyModeControl roomId={roomId} initialStatus={studyStatus} />
        </section>
      ) : null}

      <section className="rounded-[14px] border border-app bg-surface p-4">
        <h2 className="mb-1 font-display text-base font-semibold text-main">Notificaciones</h2>
        <p className="mb-2 text-xs text-muted">Avisos puntuales, nunca spam — los podés apagar cuando quieras.</p>
        <NotificationSettings />
      </section>

      <section className="rounded-[14px] border border-red-200 bg-red-50 p-4">
        <h2 className="mb-2 font-display text-base font-semibold text-red-800">Zona de peligro</h2>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="min-h-11 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Eliminar cuenta
        </button>
      </section>

      {showDelete ? (
        <DeleteAccountDialog pending={deleting} onConfirm={() => void handleDelete()} onCancel={() => setShowDelete(false)} />
      ) : null}
    </main>
  );
}
