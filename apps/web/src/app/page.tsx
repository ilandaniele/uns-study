import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RoomSkeleton } from "@/features/room/RoomSkeleton";
import { RoomExperience } from "@/features/simple-room/RoomExperience";
import { ROOM_HOURS_COPY } from "@/features/help/room-hours-copy";

export const metadata: Metadata = {
  title: "Sala",
  description: "Consultá los lugares reportados en la sala Manuel Gil de Alem 1253, Bahía Blanca. Mapa colaborativo sin reservas, información para tu visita y guías de estudio.",
  alternates: { canonical: "/" },
};

// Single-room MVP: the home is the principal room. `/sala/principal` redirects here (next.config.ts).
export default function HomePage() {
  return (
    <>
      <noscript>
        <div className="mx-auto max-w-7xl space-y-2 px-4 pt-6 text-sm">
          <h1 className="text-2xl font-bold">Sala de Estudio · Bahía Blanca</h1>
          <p>El mapa interactivo necesita JavaScript para consultar la disponibilidad actual. Podés leer la <a href="#conocer-la-sala" className="text-primary underline">información de la sala y las guías</a> sin activarlo.</p>
        </div>
      </noscript>
      <Suspense fallback={<RoomSkeleton />}>
        <RoomExperience slug="principal" about={null} />
      </Suspense>
      {/* Keep public information outside the map's streamed/client-controlled boundary. */}
      <AboutSection />
    </>
  );
}

/** Useful to every visitor, including before hydration or when the live map cannot load. */
function AboutSection() {
  return (
    <section id="conocer-la-sala" aria-labelledby="about-heading" className="mx-auto max-w-7xl scroll-mt-36 px-4 pb-10 pt-7 text-sm leading-relaxed text-muted">
      <div className="space-y-6 border-t border-app pt-7">
        <div className="max-w-3xl space-y-3">
          <p className="t-label text-primary">Para tu próxima visita</p>
          <h2 id="about-heading" className="text-2xl font-bold tracking-tight text-main">Estudiar en la sala de Alem, Bahía Blanca</h2>
          <p>Este mapa representa la sala de lectura Manuel Gil, en avenida Alem 1253. Podés consultar los reportes de disponibilidad sin registrarte. Quienes están en la sala ayudan a mantenerlos al día; no son datos de sensores ni una reserva de lugar.</p>
          <Link href="/guias/visitar-la-sala-de-estudio-uns" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Prepará tu visita: ubicación, horarios y ejemplos del mapa →</Link>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <h3 className="font-semibold text-main">Antes de salir</h3>
            <p>Revisá cuándo se actualizó cada lugar. «Libre» indica una observación vigente; «Sin datos» significa que falta información, no que haya una silla vacía. Si no hay libres confirmados pero quedan lugares sin datos, no podemos asegurar que la sala esté llena.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-main">Cuando llegás</h3>
            <p>Tocá una silla para abrir su detalle. Con una cuenta y la comprobación de cercanía podés informar «Está libre», «Está ocupado» o «Está guardado». Elegí «Estoy acá» solo en tu asiento. Las pertenencias sin una persona se informan como guardado y no generan una reserva.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-main">Al terminar</h3>
            <p>Marcá «Me voy» para liberar tu presencia. Los reportes comunes de libre y ocupado vencen a las dos horas; «Estoy acá» dura normalmente tres horas y puede renovarse. Un reporte vencido puede volver a «Sin datos» hasta que alguien aporte información nueva.</p>
          </div>
        </div>
        <div className="grid gap-6 rounded-2xl border border-app bg-surface p-5 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-semibold text-main">Horario de referencia de la app</h3>
            <p>{ROOM_HOURS_COPY}</p>
            <p>La guía de visita distingue este horario de las fuentes institucionales. Consultá los <a href="https://bc.uns.edu.ar/salasdelectura/" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">avisos de la Biblioteca Central UNS</a> para confirmar acceso y cambios excepcionales.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-main">Herramientas para aprovechar el tiempo</h3>
            <p>Organizá una tarea y un descanso con <Link href="/foco" className="text-primary underline underline-offset-4">Foco</Link>, o prepará un <Link href="/guias/organizar-la-semana-de-estudio" className="text-primary underline underline-offset-4">plan de estudio semanal</Link>. Para repasar, la guía de <Link href="/guias/practica-de-recuperacion-y-repaso-espaciado" className="text-primary underline underline-offset-4">recuperación y repaso espaciado</Link> propone ejercicios y un cronograma para adaptar a tu materia.</p>
          </div>
        </div>
        <p className="max-w-3xl">Proyecto independiente desarrollado por Ilan Daniele, sin representación de la UNS. Para informar un error del mapa o corregir una guía, usá <Link href="/sugerencias" className="text-primary underline underline-offset-4">Sugerencias y contacto</Link> o escribí a <a href="mailto:ilan.daniele@gmail.com" className="break-all text-primary underline underline-offset-4">ilan.daniele@gmail.com</a>.</p>
        <nav aria-label="Información y ayuda" className="flex flex-wrap gap-x-5 border-t border-app pt-3">
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
