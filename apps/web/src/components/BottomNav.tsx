"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAccess } from "@/features/admin/useAdminAccess";

const ITEMS: { label: string; href: string; icon: string }[] = [
  { label: "Sala", href: "/sala/principal", icon: "🗺️" },
  { label: "Personas", href: "/personas", icon: "🧑‍🤝‍🧑" },
  { label: "Chat", href: "/chat", icon: "💬" },
  { label: "Ranking", href: "/ranking", icon: "🏆" },
  { label: "Perfil", href: "/perfil", icon: "👤" },
];

/** Mobile-only bottom tab bar, mirrors the desktop header nav. Hidden on `sm:` and up. */
export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useAdminAccess();
  const items = isAdmin ? [...ITEMS, { label: "Admin", href: "/admin", icon: "🛠️" }] : ITEMS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white sm:hidden">
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              active ? "text-primary" : "text-slate-500"
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
