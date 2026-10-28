"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminNav } from "@/features/admin/AdminNav";
import { useAdminAccess } from "@/features/admin/useAdminAccess";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { loading, isAdmin, me } = useAdminAccess();
  const pathname = usePathname();
  const ownerSection = ["/admin/users", "/admin/announcements", "/admin/geofence", "/admin/mails", "/admin/colaboradores"].some(path => pathname === path || pathname?.startsWith(`${path}/`));

  if (loading) {
    return <main className="p-6 text-center text-muted">Verificando acceso…</main>;
  }

  if (!isAdmin || (ownerSection && !me?.isSuperAdmin)) {
    return (
      <main className="p-6 text-center text-[var(--seat-occupied)]">
        No tenés permisos para ver esta sección.
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="qr-print-hide t-heading">Administración</h1>
      <AdminNav />
      {children}
    </main>
  );
}
