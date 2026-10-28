"use client";

import { deleteAccountSchema, type PublicProfileDto } from "@sala/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { RewardedAdButton } from "@/features/ads/RewardedAdButton";
import { useAdFree } from "@/features/ads/useAdFree";
import { useMe } from "@/lib/me-store";
import Link from "next/link";
import { NotificationSettings } from "@/features/notifications/NotificationSettings";
import { AppearancePreview } from "@/features/profile/AppearancePreview";
import { AvatarUploader } from "@/features/profile/AvatarUploader";
import { DeleteAccountDialog } from "@/features/profile/DeleteAccountDialog";
import { PrivacyToggles } from "@/features/profile/PrivacyToggles";
import { ProfileForm } from "@/features/profile/ProfileForm";
import { StudyModeControl } from "@/features/profile/StudyModeControl";
import { useMyProfile } from "@/features/profile/useMyProfile";
import { AutoExtendSetting } from "@/features/auto-extend/AutoExtendSetting";
import { BadgesSection } from "@/features/badges/BadgesSection";
import { MyAchievements } from "@/features/badges/MyAchievements";
import { ExamsSection } from "@/features/exams/ExamsSection";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";
import { FlairSection } from "@/features/flair/FlairSection";
import { PaletteSection } from "@/features/theme/PaletteSection";
import { WeeklyGoalCard } from "@/features/weekly-goal/WeeklyGoalCard";
import { apiFetch, apiPost } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { invalidateMe } from "@/lib/me-store";
import { resetSocket } from "@/lib/socket";

const ROOM_SLUG = "principal";

export default function PerfilPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const { profile, privacy, loading, error, saving, saveProfile, savePrivacy, setLocalAvatarUrl } = useMyProfile();
  const [studyStatus, setStudyStatus] = useState<PublicProfileDto["studyStatus"]>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [verifyAvailable, setVerifyAvailable] = useState(false);
  const { me } = useMe();
  const { adFree, snoozedUntil } = useAdFree();
  const { lock } = usePro();

  useEffect(() => {
    void apiFetch<{ id: string }>(`/api/v1/rooms/${ROOM_SLUG}`).then((room) => setRoomId(room.id));
  }, []);

  useEffect(() => {
    apiFetch<{ emailVerification?: boolean }>("/api/v1/auth-providers")
      .then((p) => setVerifyAvailable(Boolean(p.emailVerification)))
      .catch(() => setVerifyAvailable(false));
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    void apiFetch<PublicProfileDto>(`/api/v1/profiles/${session.user.id}`).then((pub) => setStudyStatus(pub.studyStatus));
  }, [session?.user]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiPost("/api/v1/me/delete", { confirm: "ELIMINAR" }, deleteAccountSchema);
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
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-muted">{error ?? "Iniciá sesión para ver tu perfil."}</p>
        {!session?.user || !me?.user ? (
          <Link href="/login" className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white">
            Ingresar
          </Link>
        ) : null}
        <Link href="/sugerencias" className="text-sm font-semibold text-primary underline underline-offset-2">
          Sugerencias y contacto
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-0 p-4 pb-16">
      <div>
        <h1 className="t-heading">Perfil</h1>
        <Link href="/personas?tab=friends" className="inline-flex min-h-11 items-center rounded-full border border-app px-4 text-sm font-semibold text-primary">Mis amigos</Link>
        <p className="mt-2 text-sm text-muted">{profile.email}</p>
        {verifyAvailable && !session.user.emailVerified ? (
          <Link href="/login?next=/perfil" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Confirmar email con un código</Link>
        ) : null}
      </div>

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-3 t-title">Foto de perfil</h2>
        <AvatarUploader
          avatarUrl={profile.avatarUrl}
          displayName={session.user.name || profile.nickname || profile.firstName || "?"}
          googleImage={session.user.image ?? null}
          showAvatar={privacy.showAvatar}
          onAvatarUrlChange={setLocalAvatarUrl}
          onEnableShowAvatar={() => void savePrivacy({ showAvatar: true })}
        />
      </section>

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-3 t-title">Tu perfil</h2>
        <ProfileForm
          profile={profile}
          privacy={privacy}
          saving={saving}
          onSave={saveProfile}
        />
      </section>

      <CollapsibleSection id="privacidad" title="Privacidad" description="Todo está oculto por defecto. Activá sólo lo que quieras compartir.">
        <PrivacyToggles
          privacy={privacy}
          isAdmin={profile.isAdmin}
          saving={saving}
          onChange={(patch) => {
            setPrivacyError(null);
            void savePrivacy(patch).then((ok) => {
              if (!ok) setPrivacyError("No pudimos guardar los cambios. Probá de nuevo.");
            });
          }}
        />
        {privacyError ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {privacyError}
          </p>
        ) : null}
      </CollapsibleSection>

      {roomId ? (
        <CollapsibleSection id="modo-estudio" title="Modo estudio">
          <StudyModeControl roomId={roomId} initialStatus={studyStatus} />
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection id="notificaciones" title="Notificaciones" description="Avisos puntuales, nunca spam. Los podés apagar cuando quieras.">
        <NotificationSettings />
      </CollapsibleSection>

      <div className="rounded-3xl border border-app bg-surface p-5 sm:p-6"><MyAchievements userId={session.user.id}/></div>
      <CollapsibleSection id="tu-estudio" title="Tu estudio">
        <WeeklyGoalCard />
        <BadgesSection userId={session.user.id} />
        <ExamsSection />
        <AutoExtendSetting />
        <Link href="/perfil/historial" className="text-sm underline">
          Historial de estudio
          {lock === "locked" ? (
            <>
              {" "}
              <ProBadge inline />
            </>
          ) : null}
        </Link>
      </CollapsibleSection>

      <CollapsibleSection id="apariencia" title="Apariencia">
        <PaletteSection />
        <FlairSection userId={session.user.id} name={session.user.name || profile.nickname || profile.firstName || "?"} avatarUrl={profile.avatarUrl} />
      </CollapsibleSection>

      <CollapsibleSection id="anuncios" title="Anuncios">
        {adFree && (me?.roles.length ?? 0) > 0 ? (
          <p className="text-sm text-muted">Como parte del equipo de la sala, no ves anuncios.</p>
        ) : adFree ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">Tenés Sala de Estudio Pro. Gracias por apoyar la sala.</p>
            <Link
              href="/suscripcion"
              className="inline-flex min-h-11 items-center rounded-control border border-app px-4 text-sm font-semibold text-main hover:bg-surface-2"
            >
              Gestionar suscripción
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <RewardedAdButton />
            {snoozedUntil !== null ? (
              <p className="text-sm text-muted">
                Sin anuncios hasta las {new Date(snoozedUntil).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}.
              </p>
            ) : null}
            {me?.subscriptionsEnabled ? (
              <Link href="/suscripcion" className="text-sm font-semibold text-primary underline underline-offset-2">
                Sacá los anuncios por ${me.subscriptionPriceArs}/mes
              </Link>
            ) : null}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="vista-previa" title="Cómo te ven los demás" description="Vista previa con lo que tenés guardado.">
        <AppearancePreview profile={profile} privacy={privacy} />
      </CollapsibleSection>

      <CollapsibleSection id="ayuda" title="Ayuda">
        <div className="flex flex-col items-start gap-2">
          <Link href="/como-usar" className="text-sm font-semibold text-primary underline underline-offset-2">
            Cómo usar la app
          </Link>
          <Link href="/sugerencias" className="text-sm font-semibold text-primary underline underline-offset-2">
            Sugerencias y contacto
          </Link>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="zona-de-peligro" title="Zona de peligro" className="border-t border-red-200" titleClassName="text-red-700">
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="min-h-11 rounded-control border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Eliminar cuenta
        </button>
      </CollapsibleSection>

      {showDelete ? (
        <DeleteAccountDialog pending={deleting} onConfirm={() => void handleDelete()} onCancel={() => setShowDelete(false)} />
      ) : null}
    </main>
  );
}
