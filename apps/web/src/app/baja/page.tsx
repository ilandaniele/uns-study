import type { Metadata } from "next";
import { Suspense } from "react";
import { BackButton } from "@/components/BackButton";
import { UnsubscribeClient } from "@/features/email/UnsubscribeClient";

export const metadata: Metadata = { title: "Dejar de recibir novedades", robots: { index: false }, referrer: "no-referrer" };

export default function UnsubscribePage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Novedades por mail</h1>
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <UnsubscribeClient />
      </Suspense>
    </main>
  );
}
