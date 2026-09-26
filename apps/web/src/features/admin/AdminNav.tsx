"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Sala en vivo" },
  { href: "/admin/reports", label: "Reportes" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/announcements", label: "Anuncios" },
  { href: "/admin/qr", label: "Códigos QR" },
  { href: "/admin/audit", label: "Auditoría" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
