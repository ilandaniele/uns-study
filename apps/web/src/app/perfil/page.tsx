"use client";

import { deleteAccountSchema, type PublicProfileDto } from "@sala/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { ExamsSection } from "@/features/exams/ExamsSection";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";
import { FlairSection } from "@/features/flair/FlairSection";
import { PaletteSection } from "@/features/theme/PaletteSection";
import { WeeklyGoalCard } from "@/features/weekly-goal/WeeklyGoalCard";
import { apiFetch, apiPost } from "@/lib/api";
import { authClient, signOut, useSession } from "@/lib/auth-client";
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
  const [verifySent, setVerifySent] = useState(false);
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

  async function handleVerifyEmail() {
    if (!session?.user) return;
    setVerifySent(true);
    const { error: verifyError } = await authClient.sendVerificationEmail({ email: session.user.email, callbackURL: "/perfil" });
    if (verifyError) setVerifySent(false);
  }

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
        {!session?.user ? (
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
        <p className="mt-2 text-sm text-muted">{profile.email}</p>
        {verifyAvailable && !session.user.emailVerified ? (
          <button
            type="button"
            onClick={() => void handleVerifyEmail()}
            disabled={verifySent}
            className="mt-1 text-sm font-semibold text-main underline disabled:no-underline disabled:opacity-60"
          >
            {verifySent ? "Te enviamos un mail para verificar" : "Verificar email"}
          </button>
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

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-1 t-title">Privacidad</h2>
        <p className="mb-2 text-xs text-muted">Todo está oculto por defecto. Activá sólo lo que quieras compartir.</p>
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
      </section>

      {roomId ? (
        <section className="border-t border-app py-6 first:border-t-0">
          <h2 className="mb-3 t-title">Modo estudio</h2>
          <StudyModeControl roomId={roomId} initialStatus={studyStatus} />
        </section>
      ) : null}

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-1 t-title">Notificaciones</h2>
        <p className="mb-2 text-xs text-muted">Avisos puntuales, nunca spam. Los podés apagar cuando quieras.</p>
        <NotificationSettings />
      </section>

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-3 t-title">Tu estudio</h2>
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
      </section>

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-3 t-title">Apariencia</h2>
        <PaletteSection />
        <FlairSection userId={session.user.id} name={session.user.name || profile.nickname || profile.firstName || "?"} avatarUrl={profile.avatarUrl} />
      </section>

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-2 t-title">Anuncios</h2>
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
      </section>

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-1 t-title">Cómo te ven los demás</h2>
        <p className="mb-3 text-xs text-muted">Vista previa con lo que tenés guardado.</p>
        <AppearancePreview profile={profile} privacy={privacy} />
      </section>

      <section className="border-t border-app py-6 first:border-t-0">
        <h2 className="mb-2 t-title">Ayuda</h2>
        <div className="flex flex-col items-start gap-2">
          <Link href="/como-usar" className="text-sm font-semibold text-primary underline underline-offset-2">
            Cómo usar la app
          </Link>
          <Link href="/sugerencias" className="text-sm font-semibold text-primary underline underline-offset-2">
            Sugerencias y contacto
          </Link>
        </div>
      </section>

      <section className="border-t border-red-200 pt-6">
        <h2 className="mb-2 t-title text-red-700">Zona de peligro</h2>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="min-h-11 rounded-control border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
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
