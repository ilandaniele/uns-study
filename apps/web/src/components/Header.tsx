"use client";

import { ArmchairIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { prefetchHandlers } from "@/lib/prefetch";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { useAdminAccess } from "@/features/admin/useAdminAccess";
import { ThemeToggle } from "@/components/ThemeToggle";
import { invalidateMe } from "@/lib/me-store";
import { resetSocket } from "@/lib/socket";

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Sala", href: "/sala/principal" },
  { label: "Personas", href: "/personas" },
  { label: "Comunidad", href: "/comunidad" },
  { label: "Chat", href: "/chat" },
  { label: "Ranking", href: "/ranking" },
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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-app bg-surface/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/sala/principal" aria-label="Sala de Estudio UNS" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-main">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white">
            <ArmchairIcon size={20} weight="bold" />
          </span>
          <span aria-hidden="true" className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.01em]">Sala de Estudio</span>
            <span className="label-caps mt-1 !text-[10px] text-muted">UNS · Bahía Blanca</span>
          </span>
        </Link>
      </div>

      <nav className="hidden items-center gap-1 text-sm font-semibold lg:flex">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              {...prefetchHandlers(item.href)}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2 transition-colors ${
                active ? "bg-[var(--surface-2)] text-main shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted hover:bg-[var(--surface-2)] hover:text-main"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 text-sm">
        <ThemeToggle />
        {loading ? null : user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-main xl:inline">{user.name ?? user.email}</span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-9 shrink-0 rounded-lg border border-app px-3 py-1.5 font-semibold text-main hover:bg-[var(--surface-2)]"
            >
              <span className="lg:hidden">Salir</span>
              <span className="hidden lg:inline">Cerrar sesión</span>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="min-h-9 shrink-0 rounded-lg bg-primary px-3.5 py-1.5 font-semibold text-white hover:bg-primary-dark"
          >
            Ingresar
          </Link>
        )}
      </div>
    </header>
  );
}
