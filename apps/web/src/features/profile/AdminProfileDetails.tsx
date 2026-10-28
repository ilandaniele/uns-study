"use client";

import type { AdminProfileDto, IdentityMode, PrivacySettingsDto } from "@sala/contracts";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-store";
import { instagramHref } from "./instagram";
import { ProfileAdminAction } from "./ProfileAdminAction";
import { OwnerSeedGift } from "@/features/admin/OwnerSeedGift";

const MODES: Record<IdentityMode, string> = { HIDDEN: "Identidad oculta", FULL_NAME: "Nombre y apellido", FIRST_NAME: "Nombre", NICKNAME: "Apodo", NICKNAME_AND_NAME: "Apodo y nombre" };
const PRIVACY: Record<keyof PrivacySettingsDto, string> = {
  showFullName: "Mostrar nombre completo", showNickname: "Mostrar apodo", showCareer: "Mostrar carrera",
  showCurrentSubject: "Mostrar materia", showInstagram: "Mostrar Instagram", showStudentNumber: "Mostrar legajo",
  showAvatar: "Mostrar foto", showInRoom: "Mostrar en la sala", showSeat: "Mostrar asiento",
  allowDirectMessages: "Permitir mensajes directos", showInRanking: "Aparecer en el ranking",
  showAliasAnimalOnMap: "Mostrar animal en el mapa", showAdminBadge: "Mostrar insignia de admin",
};
const date = (value: string) => new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

/** Private data lives only in this role-gated subtree, separate from public profile responses. */
export function AdminProfileDetails({ userId, alias }: { userId?: string; alias?: string }) {
  const { me } = useMe();
  if (!me?.user || !me.isSuperAdmin) return null;
  const path = alias ? `/api/v1/admin/aliases/${encodeURIComponent(alias)}/profile` : userId ? `/api/v1/admin/users/${encodeURIComponent(userId)}/profile` : null;
  return path ? <AdminProfileView key={`${me.user.id}:${path}`} path={path} aliasView={Boolean(alias)} /> : null;
}

function AdminProfileView({ path, aliasView }: { path: string; aliasView: boolean }) {
  const [data, setData] = useState<AdminProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<AdminProfileDto>(path, { signal: controller.signal, cache: "no-store" })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError("No pudimos cargar los datos administrativos del perfil."); });
    return () => controller.abort();
  }, [path, attempt]);

  const profile = data?.profile;
  const instagram = profile?.instagram ? instagramHref(profile.instagram) : null;
  return <section aria-label="Vista administrativa del perfil" className="mt-5 space-y-5 rounded-3xl border border-app bg-surface p-5 sm:p-8">
    <div className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheckIcon size={22} aria-hidden="true" className="shrink-0 text-primary" />Vista de administración</h2>
      <p className="text-sm leading-relaxed text-muted">Datos guardados de la cuenta y el perfil, incluidos los ocultos al resto de las personas. Sólo el súper admin puede consultar esta vista. La consulta queda registrada.</p>
    </div>
    {error ? <div><p role="alert" className="text-sm text-[var(--seat-occupied)]">{error}</p><button type="button" onClick={() => { setError(null); setAttempt(n => n + 1); }} className="mt-2 min-h-11 rounded-full border border-app px-4 text-sm font-semibold">Reintentar</button></div>
      : !data ? <p role="status" className="text-sm text-muted">Cargando datos del perfil…</p> : <>
      <div className="flex flex-wrap gap-4">
        {[{ label: "Foto de la cuenta", src: data.account.avatarUrl }, { label: "Foto del perfil", src: profile?.avatarUrl }].map(({ label, src }) => src ? <figure key={label} className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- stored account photo or authenticated, uncached admin avatar endpoint */}
          <img src={src} width={96} height={96} loading="lazy" referrerPolicy="no-referrer" alt={label} className="h-24 w-24 rounded-2xl border border-app object-cover" />
          <figcaption className="text-xs text-muted">{label}</figcaption>
        </figure> : null)}
      </div>
      <Group title="Cuenta">
        <Detail label="Nombre de la cuenta">{data.account.name}</Detail>
        <Detail label="Correo"><a href={`mailto:${data.account.email}`} className="text-primary underline">{data.account.email}</a></Detail>
        <Detail label="Correo verificado">{data.account.emailVerified ? "Sí" : "No"}</Detail>
        <Detail label="Roles">{data.isSuperAdmin ? "SUPERADMIN" : data.roles.join(", ") || "Usuario"}</Detail>
        <Detail label="Registro">{date(data.account.createdAt)}</Detail>
        <Detail label="Última actualización de cuenta">{date(data.account.updatedAt)}</Detail>
        <Detail label="Identificador de cuenta">{data.userId}</Detail>
      </Group>
      <Group title="Datos completos del perfil">
        {profile ? <>
          <Detail label="Nombre">{profile.firstName}</Detail><Detail label="Apellido">{profile.lastName}</Detail>
          <Detail label="Apodo">{profile.nickname}</Detail><Detail label="Nombre personalizado">{profile.customName}</Detail>
          <Detail label="Alias">{profile.alias}</Detail><Detail label="Animal del alias">{profile.aliasAnimal}</Detail>
          <Detail label="Identidad elegida">{MODES[profile.identityMode]}</Detail><Detail label="Carrera">{profile.career}</Detail>
          <Detail label="Materia actual">{profile.currentSubject}</Detail><Detail label="Legajo">{profile.studentNumber}</Detail>
          <Detail label="Instagram">{instagram ? <a href={instagram} target="_blank" rel="noopener noreferrer" className="text-primary underline">@{profile.instagram}</a> : profile.instagram}</Detail>
          <Detail label="Bio">{profile.bio}</Detail>
          <Detail label="Creación del perfil">{date(profile.createdAt)}</Detail><Detail label="Última actualización del perfil">{date(profile.updatedAt)}</Detail>
        </> : <Detail label="Estado del perfil">Esta persona todavía no completó su perfil.</Detail>}
      </Group>
      <Group title="Actividad actual">
        <Detail label="Lugar actual">{data.activeCheckIn ? `${data.activeCheckIn.roomName} · ${data.activeCheckIn.seatCode}` : "Sin presencia activa"}</Detail>
        {data.activeCheckIn ? <><Detail label="Identidad visible en el asiento">{data.activeCheckIn.showIdentity ? "Sí" : "No"}</Detail><Detail label="Se sentó">{date(data.activeCheckIn.startedAt)}</Detail><Detail label="Presencia hasta">{date(data.activeCheckIn.expiresAt)}</Detail></> : null}
        <Detail label="Materia de estudio">{data.studyStatus?.subject}</Detail><Detail label="Mensaje de estudio">{data.studyStatus?.message}</Detail>
        <Detail label="Busca grupo de estudio">{data.studyStatus ? (data.studyStatus.lookingForGroup ? "Sí" : "No") : "Sin modo estudio activo"}</Detail>
        {data.studyStatus ? <Detail label="Estudiando desde">{date(data.studyStatus.startedAt)}</Detail> : null}
      </Group>
      <details className="rounded-2xl border border-app p-4">
        <summary className="min-h-6 cursor-pointer text-sm font-semibold">Preferencias de privacidad</summary>
        {data.privacy ? <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{(Object.keys(PRIVACY) as (keyof PrivacySettingsDto)[]).map(key => <Detail key={key} label={PRIVACY[key]}>{data.privacy![key] ? "Sí" : "No"}</Detail>)}</dl> : <p className="mt-3 text-sm text-muted">No guardó preferencias de privacidad.</p>}
      </details>
      {aliasView ? <ProfileAdminAction userId={data.userId} displayName={data.account.name} onGranted={async () => { setAttempt(n => n + 1); }}/> : null}
      <OwnerSeedGift userId={data.userId} displayName={data.account.name}/>
      <Link href={`/admin/users/${encodeURIComponent(data.userId)}`} className="inline-flex min-h-11 items-center rounded-full border border-app px-4 text-sm font-semibold text-primary">Abrir gestión del usuario</Link>
    </>}
  </section>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-3 border-t border-app pt-4"><h3 className="text-sm font-bold">{title}</h3><dl className="grid gap-4 text-sm sm:grid-cols-2">{children}</dl></div>;
}
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{children || <span className="text-muted">Sin completar</span>}</dd></div>;
}
