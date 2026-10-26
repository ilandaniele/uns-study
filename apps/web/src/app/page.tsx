import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GUIDES } from "@/features/guides/guides";
import { ROOM_HOURS_COPY } from "@/features/help/room-hours-copy";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { RoomPageClient } from "./sala/[slug]/RoomPageClient";

export const metadata: Metadata = {
  title: "Sala",
  description: "Mapa en tiempo real de la sala de estudio: mirá qué lugares están libres u ocupados.",
};

// Single-room MVP: the home is the principal room. `/sala/principal` redirects here (next.config.ts).
export default function HomePage() {
  return (
    <>
      <Suspense fallback={<RoomSkeleton />}>
        <RoomPageClient slug="principal" />
      </Suspense>
      <AboutSection />
    </>
  );
}

/** Server-rendered summary below the map, so the home has readable text before the map loads. */
function AboutSection() {
  return (
    <section aria-labelledby="about-heading" className="mx-auto max-w-7xl px-4 pb-10 pt-6 text-sm leading-relaxed text-muted">
      <div className="grid gap-7 border-t border-app pt-7 lg:grid-cols-2 lg:gap-12">
      <div className="max-w-prose space-y-4">
        <p className="t-label text-primary">Sala de Estudio · Bahía Blanca</p>
        <h2 id="about-heading" className="text-2xl font-bold text-main">
          Consultá la sala antes de salir
        </h2>
        <p>
          El mapa reúne lo que informan las personas que están en la sala: quién se marcó sentado y qué lugares vieron libres, ocupados o con pertenencias. Podés consultar esa información sin crear una cuenta y abrir el detalle de cada asiento tocándolo.
        </p>
        <p>La disponibilidad cambia durante el día. Revisá la antigüedad de los reportes: «Sin datos» significa que falta información vigente y no permite asegurar que un asiento esté libre. Si no hay lugares libres confirmados, eso tampoco alcanza para afirmar que la sala está llena.</p>
        <p>Cuando llegás, podés iniciar sesión y marcar «Estoy acá» si ya estás sentado. Al irte, «Me voy» ayuda a que otra persona encuentre lugar. No hay reservas y un reporte no garantiza que el asiento siga disponible cuando llegues.</p>
        <p className="rounded-2xl border border-app bg-surface p-4"><span className="mb-1 block font-semibold text-main">Horarios de referencia</span>{ROOM_HOURS_COPY}</p>
        <p>Es un proyecto independiente de estudiantes y no un servicio oficial de la universidad. <Link href="/proyecto" className="font-semibold text-primary underline underline-offset-4">Conocé cómo funciona, sus límites y el contacto del proyecto</Link>.</p>
      </div>
      <div className="max-w-prose space-y-4">
        <h3 className="text-lg font-bold text-main">Prepará tu próxima sesión de estudio</h3>
        <p>Además de consultar lugares, podés organizar bloques de trabajo con Foco y leer guías con ejemplos para la cursada y los finales. El jardín virtual representa tu tiempo de presencia registrado con árboles nativos argentinos.</p>
        <ul className="space-y-3">
          {GUIDES.slice(0, 3).map((guide) => (
            <li key={guide.slug}>
              <Link href={`/guias/${guide.slug}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">
                {guide.title}
              </Link>
              <p className="text-xs">{guide.description}</p>
            </li>
          ))}
        </ul>
        <nav aria-label="Información y ayuda" className="flex flex-wrap gap-x-5 border-t border-app pt-2">
          <Link href="/guias" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Todas las guías</Link>
          <Link href="/como-usar" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Cómo usar la app</Link>
          <Link href="/sugerencias" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Contacto</Link>
          <Link href="/privacidad" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Privacidad</Link>
          <Link href="/terminos" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Términos</Link>
        </nav>
      </div>
      </div>
    </section>
  );
}
