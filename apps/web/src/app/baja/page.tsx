import type { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeClient } from "@/features/email/UnsubscribeClient";

export const metadata: Metadata = { title: "Dejar de recibir novedades", robots: { index: false }, referrer: "no-referrer" };

export default function UnsubscribePage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <h1 className="font-display text-2xl font-semibold text-main">Novedades por mail</h1>
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <UnsubscribeClient />
      </Suspense>
    </main>
  );
}
