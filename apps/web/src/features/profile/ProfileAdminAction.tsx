"use client";

import type { AdminUserDto } from "@sala/contracts";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState } from "react";
import { apiFetch, apiPut, ApiRequestError } from "@/lib/api";
import { useMe } from "@/lib/me-store";

/** The owner capability comes from /me; the existing API also checks ownership on every write. */
export function ProfileAdminAction({ userId, displayName, onGranted }: {
  userId: string; displayName: string; onGranted: () => Promise<void>;
}) {
  const { me } = useMe();
  if (!me?.canManageAdmins || me.user?.id === userId) return null;
  return <OwnerAction key={userId} userId={userId} displayName={displayName} onGranted={onGranted} />;
}

function OwnerAction({ userId, displayName, onGranted }: {
  userId: string; displayName: string; onGranted: () => Promise<void>;
}) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // Public badges can be hidden, so never infer the actual role from the public profile.
    void apiFetch<AdminUserDto>(`/api/v1/admin/users/${encodeURIComponent(userId)}`)
      .then(user => { if (!cancelled) { setIsAdmin(user.roles.includes("ADMIN")); setError(""); } })
      .catch(() => { if (!cancelled) setError("No pudimos comprobar el rol de esta persona."); });
    return () => { cancelled = true; };
  }, [userId, attempt]);

  async function grant() {
    if (busy.current || isAdmin !== false || !window.confirm(`¿Hacer admin a ${displayName}? Podrá administrar la sala y moderar usuarios.`)) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await apiPut(`/api/v1/admin/users/${encodeURIComponent(userId)}/admin`);
      setIsAdmin(true);
      await onGranted();
    } catch (e) {
      setError(e instanceof ApiRequestError && e.status === 403 ? "Sólo el propietario puede hacer admin a otra persona." : "No se pudo cambiar el rol. Intentá de nuevo.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <section aria-label="Administración del perfil" className="mt-5 border-t border-app pt-5">
    {isAdmin === true ? <p role="status" className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheckIcon size={20} aria-hidden="true" />Esta persona es administradora.</p>
      : <button type="button" onClick={() => void grant()} disabled={pending || isAdmin === null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-app px-5 py-2.5 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"><ShieldCheckIcon size={20} aria-hidden="true" />{pending ? "Guardando…" : isAdmin === null ? "Comprobando rol…" : "Hacer admin"}</button>}
    {error ? <div className="mt-3 text-sm"><p role="alert" className="text-[var(--seat-occupied)]">{error}</p>{isAdmin === null ? <button type="button" onClick={() => setAttempt(n => n + 1)} className="mt-2 min-h-11 text-primary underline">Reintentar</button> : null}</div> : null}
  </section>;
}
