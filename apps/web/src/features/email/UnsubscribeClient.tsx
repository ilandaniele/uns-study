"use client";

import type { EmailUnsubscribeStatusDto } from "@sala/contracts";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type View = "loading" | "invalid" | "ready" | "already" | "done" | "error";

/** Public /baja page: GET only reads the status, so a link scanner opening the URL never unsubscribes anyone. */
export function UnsubscribeClient() {
  const params = useSearchParams();
  // Read the token once into state, then scrub it from the address bar (history, referrers, analytics).
  const [query] = useState<string | null>(() => {
    const u = params.get("u");
    const t = params.get("t");
    return u && t ? `u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}` : null;
  });
  const [view, setView] = useState<View>(query ? "loading" : "invalid");

  useEffect(() => {
    if (query) window.history.replaceState(null, "", "/baja");
  }, [query]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    apiFetch<EmailUnsubscribeStatusDto>(`/api/v1/email/unsubscribe?${query}`)
      .then((status) => {
        if (!cancelled) setView(!status.valid ? "invalid" : status.subscribed ? "ready" : "already");
      })
      .catch(() => {
        if (!cancelled) setView("error");
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  async function unsubscribe() {
    if (!query) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/email/unsubscribe?${query}`, { method: "POST" });
      setView("done");
    } catch {
      setView("error");
    } finally {
      setBusy(false);
    }
  }

  if (view === "loading") return <p className="text-muted">Cargando…</p>;
  if (view === "invalid")
    return (
      <p className="text-[var(--seat-occupied)]">
        El enlace no es válido o está incompleto. Abrí el enlace del último mail o desactivá las novedades desde tu perfil.
      </p>
    );
  if (view === "done") return <p>Listo, no vas a recibir más novedades. Podés volver a activarlas en tu perfil.</p>;
  if (view === "already") return <p>Ya no recibís novedades por mail. Podés volver a activarlas en tu perfil.</p>;

  return (
    <div className="flex flex-col items-start gap-3">
      {view === "error" ? <p className="text-[var(--seat-occupied)]">No pudimos completar la baja. Intentá de nuevo en unos minutos.</p> : null}
      <button
        type="button"
        onClick={() => void unsubscribe()}
        disabled={busy}
        className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        Dejar de recibir novedades por mail
      </button>
    </div>
  );
}
