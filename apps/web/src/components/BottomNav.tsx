"use client";

import { DotsThreeIcon, TrophyIcon, PlantIcon, SquaresFourIcon, TimerIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, isNavActive } from "@/lib/navigation";
import { prefetchHandlers } from "@/lib/prefetch";

const ICONS = [SquaresFourIcon, TimerIcon, PlantIcon, TrophyIcon, DotsThreeIcon];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-app bg-surface/95 px-2 pb-safe backdrop-blur lg:hidden">
      {PRIMARY_NAV.map((item, index) => {
        const active = isNavActive(item.href, pathname);
        const Icon = ICONS[index];
        return (
          <Link key={item.href} href={item.href} {...prefetchHandlers(item.href)} aria-current={active ? "page" : undefined}
            className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${active ? "font-bold text-primary" : "font-medium text-muted hover:text-main"}`}>
            <span aria-hidden="true" className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]" : ""}`}>
              <Icon size={23} weight={active ? "fill" : "regular"} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
