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
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-app bg-surface pb-safe lg:hidden">
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
              active ? "text-primary" : "text-muted"
            }`}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
