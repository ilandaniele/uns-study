"use client";

import type { QrResolveDto } from "@uns/contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";

/** Resolves a scanned QR token and redirects into the room, highlighting the target table
 *  and carrying the token so check-in/observation actions can be marked QR-verified. */
export default function QrRedirectPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<QrResolveDto>(`/api/v1/qr/${params.token}`)
      .then((dto) => {
        if (cancelled) return;
        const search = new URLSearchParams({ source: "qr", qr: params.token });
        if (dto.tableCode) search.set("table", dto.tableCode);
        router.replace(`/sala/${dto.roomSlug}?${search.toString()}`);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError && err.code === "INVALID_QR"
            ? "Este código QR no es válido o ya no está activo."
            : "No pudimos leer este código QR.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [params.token, router]);

  if (error) {
    return <main className="p-6 text-center text-red-600">{error}</main>;
  }

  return <main className="p-6 text-center text-slate-500">Redirigiendo…</main>;
}
