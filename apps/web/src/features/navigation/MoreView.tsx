"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChatCircleIcon,
  CrownSimpleIcon,
  HeartIcon,
  QuestionIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useAdminAccess } from "@/features/admin/useAdminAccess";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  {
    href: "/perfil",
    title: "Mi perfil",
    detail: "Tus datos, privacidad y preferencias",
    icon: UserCircleIcon,
  },
  {
    href: "/personas",
    title: "Personas",
    detail: "Encontrá con quién compartir el estudio",
    icon: UsersThreeIcon,
  },
  {
    href: "/guias",
    title: "Guías de estudio",
    detail: "Ideas prácticas para estudiar mejor",
    icon: BookOpenIcon,
  },
  {
    href: "/chat",
    title: "Conversaciones",
    detail: "Chat de la sala, mensajes y grupos",
    icon: ChatCircleIcon,
  },
  {
    href: "/como-usar",
    title: "Cómo usar la app",
    detail: "Lugares, presencia y colaboración",
    icon: QuestionIcon,
  },
];

export function MoreView() {
  const { me, isAdmin } = useAdminAccess();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-24 pt-7 sm:pt-10">
      <div>
        <p className="t-label text-primary">A tu manera</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Más de la sala
        </h1>
        <p className="mt-2 text-sm text-muted">
          Tu comunidad, tus herramientas y tu cuenta, en un solo lugar.
        </p>
      </div>
      <Link
        href={me?.user ? "/perfil" : "/login"}
        className="flex items-center gap-4 rounded-2xl border border-app bg-surface p-5"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
          <UserCircleIcon size={30} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">
            {me?.user?.name ?? "Tu lugar en la comunidad"}
          </span>
          <span className="text-sm text-muted">
            {me?.user
              ? "Ver y editar mi perfil"
              : "Iniciá sesión para guardar tu progreso"}
          </span>
        </span>
        <ArrowRightIcon size={20} aria-hidden="true" />
      </Link>
      <section
        aria-label="Explorar"
        className="overflow-hidden rounded-2xl border border-app bg-surface"
      >
        {LINKS.map(({ href, title, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-20 items-center gap-3 border-b border-app px-4 py-4 last:border-0 hover:bg-surface-2 sm:px-5"
          >
            <Icon
              size={23}
              aria-hidden="true"
              className="shrink-0 text-primary"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{title}</span>
              <span className="text-sm text-muted">{detail}</span>
            </span>
            <ArrowRightIcon
              size={18}
              aria-hidden="true"
              className="shrink-0 text-muted"
            />
          </Link>
        ))}
      </section>
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-app bg-surface p-5">
        <div>
          <h2 className="font-semibold">Apariencia</h2>
          <p className="text-sm text-muted">
            Claro, oscuro o según tu dispositivo.
          </p>
        </div>
        <ThemeToggle />
      </section>
      <section className="rounded-2xl border border-app bg-surface p-5">
        <CrownSimpleIcon
          size={25}
          className="text-primary"
          aria-hidden="true"
        />
        <h2 className="mt-3 text-lg font-bold">Un impulso a tu estudio</h2>
        <p className="mt-2 text-sm text-muted">
          La sala, el Pomodoro básico y tu jardín son gratuitos. Pro suma
          sonidos, combinaciones de foco, historial y pronósticos de ocupación.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/suscripcion"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white"
          >
            Conocer Pro
          </Link>
          <Link
            href="/suscripcion#donar"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-app px-4 text-sm font-semibold"
          >
            <HeartIcon size={18} aria-hidden="true" />
            Apoyar el proyecto
          </Link>
        </div>
      </section>
      {isAdmin ? (
        <Link
          href="/admin"
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-app px-5 font-semibold"
        >
          <ShieldCheckIcon size={23} aria-hidden="true" />
          Administración
          <ArrowRightIcon size={18} aria-hidden="true" className="ml-auto" />
        </Link>
      ) : null}
      <div className="flex flex-wrap gap-5 text-xs text-muted">
        <Link href="/sugerencias" className="min-h-11 py-3 underline">
          Enviar una sugerencia
        </Link>
        <Link href="/privacidad" className="min-h-11 py-3 underline">
          Privacidad
        </Link>
        <Link href="/terminos" className="min-h-11 py-3 underline">
          Términos
        </Link>
      </div>
    </main>
  );
}
