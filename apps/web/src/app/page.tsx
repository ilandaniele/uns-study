import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdSlot } from "@/components/AdSlot";
import { GUIDES } from "@/features/guides/guides";
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
      <div className="mx-auto max-w-7xl px-4 pb-10">
        <AdSlot placement="room-bottom" />
      </div>
    </>
  );
}

/** Server-rendered summary below the map, so the home has readable text before the map loads. */
function AboutSection() {
  return (
    <section aria-labelledby="about-heading" className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-sm leading-relaxed text-muted">
      <div className="max-w-prose space-y-2 border-t border-app pt-6">
        <h2 id="about-heading" className="text-base font-semibold text-main">
          Sobre Sala de Estudio
        </h2>
        <p>
          Sala de Estudio muestra en tiempo real qué lugares están libres u ocupados en la sala de estudio, para que sepas
          si hay lugar antes de ir. No hay reservas: quien está sentado marca «Estoy acá» y el resto ayuda avisando si un
          lugar está libre u ocupado. Es un proyecto independiente de estudiantes, no un servicio oficial de la
          universidad.
        </p>
        <p>
          <Link href="/como-usar" className="font-semibold text-primary underline underline-offset-2">
            Cómo usar la app
          </Link>
          {" · "}
          <Link href="/guias" className="font-semibold text-primary underline underline-offset-2">
            Guías de estudio
          </Link>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {GUIDES.slice(0, 3).map((guide) => (
            <li key={guide.slug}>
              <Link href={`/guias/${guide.slug}`} className="text-primary underline underline-offset-2">
                {guide.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
