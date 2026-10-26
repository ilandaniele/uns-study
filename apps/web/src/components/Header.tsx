"use client";

import Link from "next/link";
import { prefetchHandlers } from "@/lib/prefetch";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { useAdminAccess } from "@/features/admin/useAdminAccess";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FocusHeaderButton } from "@/features/focus/FocusHeaderButton";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { PRIMARY_NAV, isNavActive } from "@/lib/navigation";
import { invalidateMe } from "@/lib/me-store";
import { resetSocket } from "@/lib/socket";
import { DotsThreeIcon, PlantIcon, SquaresFourIcon, TimerIcon, TrophyIcon } from "@phosphor-icons/react/dist/ssr";

const NAV_ICONS = [SquaresFourIcon, TimerIcon, PlantIcon, TrophyIcon, DotsThreeIcon];

export function Header() {
  const { loading, me } = useAdminAccess();
  const user = me?.user ?? null;
  const pathname = usePathname();

  // The socket carries the caller's identity in its auth token; reconnect it right after
  // sign-out so it drops the user's channels and rejoins anonymous instead of lingering.
  async function handleSignOut() {
    await signOut();
    invalidateMe();
    resetSocket();
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-app bg-surface/95 px-4 py-2.5 max-[360px]:px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="header-brand flex min-w-0 flex-1 items-center lg:flex-none">
        <Link href="/" aria-label="Sala de Estudio" className="flex min-w-0 items-center gap-2.5 whitespace-nowrap text-main max-[360px]:gap-2">
          {/* Brand mark: black-and-orange book over a table; the dark variant swaps black for off-white. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PNG, no optimizer needed */}
          <img src="/icons/logo-mark.webp" alt="" aria-hidden="true" width={44} height={36} className="h-9 w-auto shrink-0 dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PNG, no optimizer needed */}
          <img src="/icons/logo-mark-dark.webp" alt="" aria-hidden="true" width={44} height={36} className="hidden h-9 w-auto shrink-0 dark:block" />
          <span aria-hidden="true" className="header-wordmark flex-col leading-none">
            {/* Use the space left by the actions, including a running focus timer. */}
            <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.01em] max-lg:w-[5.8em] max-lg:whitespace-normal max-lg:leading-[1.05]">
              Sala de <span className="text-main">Estudio</span>
            </span>
            <span className="t-label mt-1 !text-[10px] text-muted max-lg:hidden">Bahía Blanca</span>
          </span>
        </Link>
      </div>

      <nav aria-label="Secciones de escritorio" className="hidden min-w-0 shrink-0 items-center gap-0.5 rounded-full border border-app bg-surface-2 p-1 text-sm font-semibold lg:flex">
        {PRIMARY_NAV.map((item, index) => {
          const active = isNavActive(item.href, pathname);
          const Icon = NAV_ICONS[index];
          return (
            <Link
              key={item.label}
              href={item.href}
              {...prefetchHandlers(item.href)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary xl:px-3.5 ${
                active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-surface hover:text-main"
              }`}
            >
              <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden="true" className="hidden xl:block" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2 text-sm max-[400px]:gap-1.5">
        {me?.subscriptionsEnabled && !me.adFree ? (
          <Link
            href="/suscripcion"
            className="hidden min-h-11 shrink-0 items-center rounded-control border border-app px-3 py-1.5 font-semibold text-main hover:bg-[var(--surface-2)] xl:inline-flex"
          >
            Hacete Pro
          </Link>
        ) : null}
        <FocusHeaderButton />
        <NotificationBell />
        <ThemeToggle />
        {loading ? null : user ? (
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16ch] truncate text-main 2xl:inline">{user.name ?? user.email}</span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-11 shrink-0 rounded-control border border-app px-3 py-1.5 font-semibold text-main hover:bg-[var(--surface-2)]"
            >
              <span className="xl:hidden">Salir</span>
              <span className="hidden xl:inline">Cerrar sesión</span>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex min-h-11 shrink-0 items-center rounded-control bg-primary px-3.5 py-1.5 font-semibold text-white hover:bg-primary-dark"
          >
            Ingresar
          </Link>
        )}
      </div>
    </header>
  );
}
