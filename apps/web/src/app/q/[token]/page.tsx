"use client";

import type { QrResolveDto } from "@sala/contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { useMe } from "@/lib/me-store";
import { seatCodeLabel } from "@/features/room/format";

/** Resolves a scanned QR token and redirects into the room, highlighting the target table
 *  and carrying the token so check-in/observation actions can be marked QR-verified. */
export default function QrRedirectPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [resolved, setResolved] = useState<{ token: string; target?: QrResolveDto; error?: string } | null>(null);
  const target = resolved?.token === params.token ? resolved.target : null;
  const error = resolved?.token === params.token ? resolved.error : null;
  const { me, loading } = useMe();
  const userId = me?.user?.id;

  useEffect(() => {
    let cancelled = false;
    apiFetch<QrResolveDto>(`/api/v1/qr/${params.token}`)
      .then((dto) => {
        if (cancelled) return;
        trackEvent("qr_scan");
        setResolved({ token: params.token, target: dto });
      })
      .catch((err) => {
        if (cancelled) return;
        setResolved({ token: params.token, error: err instanceof ApiRequestError && err.code === "INVALID_QR"
            ? "Este código QR no es válido o ya no está activo."
            : "No pudimos leer este código QR." });
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  useEffect(() => {
    if (!target || (target.seatCode && (loading || !userId))) return;
    const search = new URLSearchParams({ source: "qr", qr: params.token });
    if (target.tableCode) search.set("table", target.tableCode);
    if (target.seatCode) search.set("seat", target.seatCode);
    router.replace(`/sala/${target.roomSlug}?${search.toString()}`);
  }, [target, loading, userId, params.token, router]);

  if (error) {
    return (
      <main className="flex min-h-[calc(100dvh-65px)] items-center justify-center p-6 text-center text-red-600">{error}</main>
    );
  }

  if (target?.seatCode && !loading && !userId) return (
    <main className="mx-auto flex min-h-[65dvh] max-w-md flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <h1 className="text-2xl font-bold text-main">{seatCodeLabel(target.seatCode)}</h1>
      <p className="text-sm leading-relaxed text-muted">Iniciá sesión para marcar este asiento. Al volver conservamos el QR; después tocá Estoy acá cuando estés sentado ahí.</p>
      <Link href={`/login?next=${encodeURIComponent(`/q/${params.token}`)}`} className="flex min-h-12 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white">Ingresar para marcar este asiento</Link>
    </main>
  );

  return (
    <main className="flex min-h-[calc(100dvh-65px)] flex-col items-center justify-center gap-3 p-6 text-center text-muted">
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-app border-t-primary"
      />
      <p>Redirigiendo…</p>
    </main>
  );
}
