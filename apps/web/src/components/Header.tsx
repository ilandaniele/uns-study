"use client";

import Link from "next/link";
import { prefetchHandlers } from "@/lib/prefetch";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { useAdminAccess } from "@/features/admin/useAdminAccess";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FocusHeaderButton } from "@/features/focus/FocusHeaderButton";
import { invalidateMe } from "@/lib/me-store";
import { resetSocket } from "@/lib/socket";

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Sala", href: "/" },
  { label: "Personas", href: "/personas" },
  { label: "Comunidad", href: "/comunidad" },
  { label: "Ranking", href: "/ranking" },
  { label: "Foco", href: "/foco" },
  { label: "Perfil", href: "/perfil" },
];

export function Header() {
  const { isAdmin, loading, me } = useAdminAccess();
  const user = me?.user ?? null;
  const pathname = usePathname();

  const items = isAdmin ? [...NAV_ITEMS, { label: "Admin", href: "/admin" }] : NAV_ITEMS;

  // The socket carries the caller's identity in its auth token; reconnect it right after
  // sign-out so it drops the user's channels and rejoins anonymous instead of lingering.
  async function handleSignOut() {
    await signOut();
    invalidateMe();
    resetSocket();
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-app bg-surface/95 px-4 py-2.5 max-[360px]:px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" aria-label="Sala de Estudio" className="flex min-w-0 items-center gap-2.5 whitespace-nowrap text-main max-[360px]:gap-2">
          {/* Brand mark: black-and-orange book over a table; the dark variant swaps black for off-white. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PNG, no optimizer needed */}
          <img src="/icons/logo-mark.webp" alt="" aria-hidden="true" width={44} height={36} className="h-9 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PNG, no optimizer needed */}
          <img src="/icons/logo-mark-dark.webp" alt="" aria-hidden="true" width={44} height={36} className="hidden h-9 w-auto dark:block" />
          <span aria-hidden="true" className="flex flex-col leading-none">
            {/* Under 420px the wordmark stacks on two lines so it never runs under the header buttons; under 360px it also shrinks. */}
            <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.01em] max-[420px]:w-[5.8em] max-[420px]:whitespace-normal max-[420px]:leading-[1.05] max-[360px]:text-[13px]">
              Sala de <span className="text-main">Estudio</span>
            </span>
            <span className="t-label mt-1 !text-[10px] text-muted max-[420px]:hidden">Bahía Blanca</span>
          </span>
        </Link>
      </div>

      <nav className="hidden items-center gap-1 text-sm font-semibold lg:flex">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              {...prefetchHandlers(item.href)}
              aria-current={active ? "page" : undefined}
              className={`rounded-control px-3 py-2 transition-colors ${
                active ? "bg-transparent text-main shadow-[inset_0_-2px_0_var(--text)]" : "text-muted hover:bg-[var(--surface-2)] hover:text-main"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2 text-sm">
        {me?.subscriptionsEnabled && !me.adFree ? (
          <Link
            href="/suscripcion"
            className="hidden min-h-11 shrink-0 items-center rounded-control border border-app px-3 py-1.5 font-semibold text-main hover:bg-[var(--surface-2)] lg:inline-flex"
          >
            Hacete Pro
          </Link>
        ) : null}
        <FocusHeaderButton />
        <ThemeToggle />
        {loading ? null : user ? (
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16ch] truncate text-main xl:inline">{user.name ?? user.email}</span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-11 shrink-0 rounded-control border border-app px-3 py-1.5 font-semibold text-main hover:bg-[var(--surface-2)]"
            >
              <span className="lg:hidden">Salir</span>
              <span className="hidden lg:inline">Cerrar sesión</span>
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
