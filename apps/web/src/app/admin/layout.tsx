"use client";

import type { ReactNode } from "react";
import { AdminNav } from "@/features/admin/AdminNav";
import { useAdminAccess } from "@/features/admin/useAdminAccess";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useAdminAccess();

  if (loading) {
    return <main className="p-6 text-center text-slate-500">Verificando acceso…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="p-6 text-center text-red-600">
        No tenés permisos para ver esta sección. El servidor rechazará cualquier acción igual.
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold text-slate-900">Administración</h1>
      <AdminNav />
      {children}
    </main>
  );
}
