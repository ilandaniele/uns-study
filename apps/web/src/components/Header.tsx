"use client";

import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
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
    <header className="flex items-center justify-between gap-2 border-b border-app bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/sala/principal" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-[17px] font-semibold text-main sm:text-lg">
          <BookOpenTextIcon aria-hidden="true" size={24} weight="duotone" className="text-primary" />
          Sala de Estudio UNS
        </Link>
      </div>

      <nav className="hidden items-center gap-5 text-sm font-medium lg:flex">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              {...prefetchHandlers(item.href)}
              className={`border-b-2 px-0.5 py-1 transition-colors ${
                active ? "border-primary text-primary" : "border-transparent text-muted hover:text-main"
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
              className="shrink-0 rounded-full border border-app px-3 py-1.5 font-semibold text-main hover:bg-[var(--surface-2)]"
            >
              <span className="lg:hidden">Salir</span>
              <span className="hidden lg:inline">Cerrar sesión</span>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="shrink-0 rounded-full bg-primary px-3 py-1.5 font-semibold text-white hover:bg-primary-dark"
          >
            Ingresar
          </Link>
        )}
      </div>
    </header>
  );
}
