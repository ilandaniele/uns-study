"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

/** Existing unverified sessions can still read the public map, but need proof to use an account. */
export function EmailVerificationNotice() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [required, setRequired] = useState(false);
  const unverified = Boolean(session?.user && !session.user.emailVerified);
  useEffect(() => {
    if (!unverified) return;
    let current = true;
    void apiFetch<{ emailVerificationRequired?: boolean }>("/api/v1/auth-providers").then(p => {
      if (current) setRequired(p.emailVerificationRequired === true);
    }).catch(() => undefined);
    return () => { current = false; };
  }, [unverified]);
  if (!unverified || !required || pathname === "/login") return null;
  return <aside role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-app bg-surface-2 px-4 py-3 text-sm text-main">
    <p>Confirmá que el email es tuyo para volver a usar tu cuenta. Conservás tus datos.</p>
    <Link href="/login" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 font-semibold text-white">Confirmar email</Link>
  </aside>;
}
