import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { SubscriptionPageClient } from "@/features/subscriptions/SubscriptionPageClient";
import { PRO_BENEFITS } from "@/features/subscriptions/pro";

export const metadata: Metadata = {
  title: "Sala de Estudio Pro",
  description: "Funciones opcionales de Sala de Estudio Pro, qué sigue siendo gratuito y cómo consultar la suscripción y su precio antes de confirmar un pago.",
  alternates: { canonical: "/suscripcion" },
};

export default function SuscripcionPage() {
  return (
    <main className="mx-auto max-w-prose space-y-6 px-4 py-8 text-main">
      <BackButton fallbackHref="/perfil" />
      <header className="space-y-2">
        <h1 className="t-heading">Sala de Estudio Pro</h1>
        <p className="text-sm text-muted">Herramientas opcionales para organizar tu estudio y apoyar el mantenimiento de esta app independiente.</p>
        <p className="text-sm text-muted">Consultar la sala, el temporizador básico, las guías y el jardín siguen siendo gratuitos. Pro no reserva lugares ni modifica la prioridad de los reportes.</p>
      </header>
      <section aria-labelledby="pro-benefits" className="space-y-3">
        <h2 id="pro-benefits" className="text-lg font-semibold">Qué incluye Pro</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {PRO_BENEFITS.map((benefit) => <li key={benefit}>{benefit}</li>)}
        </ul>
      </section>
      <section aria-labelledby="pro-billing" className="space-y-3 text-sm text-muted">
        <h2 id="pro-billing" className="text-lg font-semibold text-main">Precio, activación y cancelación</h2>
        <p>El precio mensual vigente y la disponibilidad se consultan al cargar tu cuenta. Revisalos antes de continuar a Mercado Pago y confirmar la suscripción. La activación depende de la confirmación del proveedor de pagos; volver a la app por sí solo no confirma un cobro.</p>
        <p>Cuando tengas una suscripción activa, podés consultar su estado y solicitar la cancelación desde esta página. Las donaciones y las compras de semillas son opciones separadas de Pro.</p>
        <Link href="/sugerencias" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Consultar sobre una suscripción o un pago</Link>
      </section>
      <noscript><p className="rounded-2xl border border-app bg-surface p-4 text-sm">Para consultar tu cuenta o gestionar pagos necesitás activar JavaScript. La información de Pro se puede leer arriba sin iniciar sesión.</p></noscript>
      <Suspense fallback={<p role="status" className="text-sm text-muted">Cargando opciones de tu cuenta…</p>}>
        <SubscriptionPageClient />
      </Suspense>
    </main>
  );
}
