"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useAdminAccess } from "@/features/admin/useAdminAccess";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Sala", href: "/sala/principal" },
  { label: "Personas", href: "/personas" },
  { label: "Comunidad", href: "/comunidad" },
  { label: "Chat", href: "/chat" },
  { label: "Ranking", href: "/ranking" },
  { label: "Perfil", href: "/perfil" },
];

export function Header() {
  const { data: session, isPending } = useSession();
  const { isAdmin } = useAdminAccess();
  const pathname = usePathname();

  const items = isAdmin ? [...NAV_ITEMS, { label: "Admin", href: "/admin" }] : NAV_ITEMS;

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-6">
        <Link href="/sala/principal" className="shrink-0 text-base font-bold text-primary sm:text-lg">
          <span className="sm:hidden">Sala UNS</span>
          <span className="hidden sm:inline">Sala de Estudio UNS</span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-medium sm:flex">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={pathname?.startsWith(item.href) ? "text-primary" : "text-slate-600 hover:text-primary"}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <ThemeToggle />
        {isPending ? null : session?.user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-slate-700 sm:inline">{session.user.name ?? session.user.email}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-white hover:bg-primary-dark"
          >
            Ingresar
          </Link>
        )}
      </div>
    </header>
  );
}
