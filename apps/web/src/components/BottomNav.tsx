"use client";

import {
  ChatCircleIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  TrophyIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { prefetchHandlers } from "@/lib/prefetch";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAdminAccess } from "@/features/admin/useAdminAccess";

const ICON_SIZE = 22;

const ITEMS: { label: string; href: string; icon: ReactNode }[] = [
  { label: "Sala", href: "/sala/principal", icon: <SquaresFourIcon size={ICON_SIZE} /> },
  { label: "Personas", href: "/personas", icon: <UsersThreeIcon size={ICON_SIZE} /> },
  { label: "Chat", href: "/chat", icon: <ChatCircleIcon size={ICON_SIZE} /> },
  { label: "Ranking", href: "/ranking", icon: <TrophyIcon size={ICON_SIZE} /> },
  { label: "Perfil", href: "/perfil", icon: <UserCircleIcon size={ICON_SIZE} /> },
];

/** Mobile-only bottom tab bar, mirrors the desktop header nav. Hidden on `sm:` and up. */
export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useAdminAccess();
  const items = isAdmin ? [...ITEMS, { label: "Admin", href: "/admin", icon: <ShieldCheckIcon size={ICON_SIZE} /> }] : ITEMS;

  return (
    <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-app bg-surface/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden">
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            {...prefetchHandlers(item.href)}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 pb-1.5 pt-2.5 text-[11px] transition-colors ${
              active ? "font-bold text-main" : "font-medium text-muted hover:text-main"
            }`}
          >
            {/* Active tab: a short petrol bar on the top edge, like a tab plate. */}
            <span
              aria-hidden="true"
              className={`absolute inset-x-1/2 top-0 h-[3px] -translate-x-1/2 rounded-b-sm bg-primary transition-[width] ${active ? "w-8" : "w-0"}`}
            />
            <span aria-hidden="true" className={active ? "text-primary" : undefined}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
