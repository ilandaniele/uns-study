"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAdminAccess } from "@/features/admin/useAdminAccess";

const ITEMS: { label: string; href: string; icon: ReactNode }[] = [
  { label: "Sala", href: "/sala/principal", icon: <MapIcon /> },
  { label: "Personas", href: "/personas", icon: <PeopleIcon /> },
  { label: "Chat", href: "/chat", icon: <ChatIcon /> },
  { label: "Ranking", href: "/ranking", icon: <RankingIcon /> },
  { label: "Perfil", href: "/perfil", icon: <ProfileIcon /> },
];

/** Mobile-only bottom tab bar, mirrors the desktop header nav. Hidden on `sm:` and up. */
export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useAdminAccess();
  const items = isAdmin ? [...ITEMS, { label: "Admin", href: "/admin", icon: <AdminIcon /> }] : ITEMS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-app bg-surface pb-safe sm:hidden">
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
            <span className="flex items-center gap-1">
              {item.label}
              {active ? <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary" /> : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function iconProps() {
  return { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
}

function MapIcon() {
  return (
    <svg {...iconProps()}>
      <path strokeLinejoin="round" d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path strokeLinecap="round" d="M9 4v14M15 6v14" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3" />
      <path strokeLinecap="round" d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path strokeLinecap="round" d="M15.5 14.2c2.6.3 4.5 2.5 4.5 5.3" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps()}>
      <path strokeLinejoin="round" d="M4 5h16v11H8l-4 4V5Z" />
    </svg>
  );
}

function RankingIcon() {
  return (
    <svg {...iconProps()}>
      <path strokeLinejoin="round" d="M4 20V10M10 20V4M16 20v-7" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg {...iconProps()}>
      <path strokeLinejoin="round" d="m12 3 7 3v5c0 4.6-3 7.8-7 10-4-2.2-7-5.4-7-10V6l7-3Z" />
    </svg>
  );
}
