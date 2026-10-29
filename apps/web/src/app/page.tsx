import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { RoomExperience } from "@/features/simple-room/RoomExperience";

export const metadata: Metadata = {
  title: "Sala",
  description: "Mapa en tiempo real de la sala de estudio: mirá qué lugares están libres u ocupados.",
};

// Single-room MVP: the home is the principal room. `/sala/principal` redirects here (next.config.ts).
export default function HomePage() {
  return (
    <>
      <Suspense fallback={<RoomSkeleton />}>
        <RoomExperience slug="principal" about={<AboutSection />} />
      </Suspense>
    </>
  );
}

/** Compact, server-rendered context; detailed explanations live in the public project and guide pages. */
function AboutSection() {
  return (
    <section aria-labelledby="about-heading" className="mx-auto max-w-7xl px-4 pb-8 pt-5 text-xs leading-relaxed text-muted">
      <div className="border-t border-app pt-5">
        <h2 id="about-heading" className="font-semibold text-main">Sala de Estudio · Bahía Blanca</h2>
        <p className="mt-2 max-w-prose">Disponibilidad colaborativa, sin reservas. Tocá un asiento para ver su estado; “Sin datos” no confirma que esté libre. Proyecto independiente de estudiantes.</p>
        <nav aria-label="Información y ayuda" className="mt-2 flex flex-wrap gap-x-5">
          <Link href="/proyecto" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Sobre el proyecto</Link>
          <Link href="/guias" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Guías de estudio</Link>
          <Link href="/como-usar" className="inline-flex min-h-11 items-center underline underline-offset-4">Cómo usar la app</Link>
          <Link href="/privacidad" className="inline-flex min-h-11 items-center underline underline-offset-4">Privacidad</Link>
          <Link href="/terminos" className="inline-flex min-h-11 items-center underline underline-offset-4">Términos</Link>
        </nav>
      </div>
    </section>
  );
}
