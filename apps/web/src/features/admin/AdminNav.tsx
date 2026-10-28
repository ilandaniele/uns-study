"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/me-store";

const ITEMS = [
  { href: "/admin", label: "Sala en vivo" },
  { href: "/admin/reports", label: "Reportes" },
  { href: "/admin/sugerencias", label: "Sugerencias" },
  { href: "/admin/users", label: "Usuarios", ownerOnly: true },
  { href: "/admin/colaboradores", label: "Colaboradores", ownerOnly: true },
  { href: "/admin/announcements", label: "Anuncios", ownerOnly: true },
  { href: "/admin/qr", label: "Códigos QR" },
  { href: "/admin/geofence", label: "Ubicación de la sala", ownerOnly: true },
  { href: "/admin/mails", label: "Mails", ownerOnly: true },
  { href: "/admin/audit", label: "Auditoría" },
];

export function AdminNav() {
  const pathname = usePathname();
  const { me } = useMe();
  return (
    <nav className="qr-print-hide flex flex-wrap gap-1 rounded-control border border-app bg-[var(--surface-2)] p-1 text-sm font-medium">
      {ITEMS.filter(item => !item.ownerOnly || me?.isSuperAdmin).map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              active ? "bg-primary text-white" : "text-muted hover:text-main"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
