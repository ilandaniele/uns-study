"use client";

import { adminDeleteUserSchema } from "@sala/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiPost } from "@/lib/api";

export function OwnerDeleteAccount({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(event: FormEvent) {
    event.preventDefault();
    if (saving || confirmation.trim().toLowerCase() !== email.trim().toLowerCase()) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/v1/admin/users/${encodeURIComponent(userId)}/delete`, {
        email: confirmation.trim(), confirmation: "ELIMINAR",
      }, adminDeleteUserSchema);
      router.replace("/admin/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos eliminar la cuenta.");
      setSaving(false);
    }
  }

  return (
    <details className="rounded-xl border border-app p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--seat-occupied)]">Eliminar cuenta</summary>
      <form onSubmit={(event) => void remove(event)} className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">Elimina la cuenta y sus datos personales. Es irreversible. Las cuentas con compras, suscripción o un lugar activo requieren revisión previa.</p>
        <label className="flex flex-col gap-1 text-sm text-main">
          Escribí el correo de esta cuenta para confirmar
          <input
            type="email" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={saving}
            className="min-h-11 min-w-0 rounded-lg border border-app bg-surface px-3 text-base"
          />
        </label>
        {error ? <p role="alert" className="text-sm text-[var(--seat-occupied)]">{error}</p> : null}
        <button type="submit" disabled={saving || confirmation.trim().toLowerCase() !== email.trim().toLowerCase()}
          className="min-h-11 w-fit rounded-lg border border-[var(--seat-occupied)] px-4 text-sm font-semibold text-[var(--seat-occupied)] disabled:opacity-50">
          {saving ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
      </form>
    </details>
  );
}
