import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { HOW_TO_STEPS } from "@/features/help/how-to-steps";
import { ROOM_HOURS_COPY } from "@/features/help/room-hours-copy";

export const metadata: Metadata = { title: "Cómo usar" };

const FAQ: { q: string; a: string }[] = [
  { q: "¿Puedo reservar un lugar?", a: "No, no hay reservas. Los lugares son para quien está sentado ahí." },
  { q: "¿Cuál es el horario de la sala?", a: ROOM_HOURS_COPY },
  {
    q: "¿Por qué me pide la ubicación?",
    a: "Para comprobar que estás cerca de la sala cuando marcás «Estoy acá». No guardamos tus coordenadas exactas ni las mostramos a nadie.",
  },
  { q: "¿Qué pasa si me olvido de liberar mi lugar?", a: "Tu registro de presencia vence a las 3 horas, salvo que toques «Sigo acá» para renovar o hayas elegido otra duración habilitada en la app. Las presencias también terminan cuando cierra la sala: a las 00:00 de lunes a viernes, o a las 22:00 los sábados, domingos y feriados. Otros reportes vigentes pueden seguir indicando el estado del lugar." },
  { q: "¿Sin datos quiere decir que el asiento está libre?", a: "No. Significa que no hay información vigente. Tocá el asiento para ver el detalle y, si estás en la sala, podés informar lo que ves." },
  { q: "¿Tengo que escanear un QR?", a: "No. Alcanza con tocar tu lugar en el mapa." },
];

export default function HowToUsePage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Cómo usar Sala de Estudio</h1>
      <p className="text-muted">Mirá qué lugares están libres antes de ir, y ayudá a mantener el mapa al día.</p>
      <p className="text-muted">La disponibilidad es colaborativa y no garantiza un asiento al llegar. Podés leer más sobre <Link href="/proyecto" className="font-semibold text-primary underline underline-offset-4">el proyecto y sus límites</Link>.</p>

      <ol className="flex flex-col divide-y divide-[var(--border)] border-y border-app">
        {HOW_TO_STEPS.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3 py-4">
            <step.icon aria-hidden="true" size={20} weight="bold" className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-main">
                {i + 1}. {step.title}
              </h2>
              <p className="mt-1 text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="pt-2 text-lg font-semibold text-main">Preguntas frecuentes</h2>
      <dl className="space-y-3">
        {FAQ.map((item) => (
          <div key={item.q}>
            <dt className="font-semibold text-main">{item.q}</dt>
            <dd className="text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>

      <Link
        href="/"
        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Ir a la sala
      </Link>
      <p className="text-center text-muted">
        Para estudiar mejor, mirá las{" "}
        <Link href="/guias" className="font-semibold text-primary underline underline-offset-2">
          guías de estudio
        </Link>
        .
      </p>
      <p className="text-center text-muted">
        ¿Algo no anda o tenés una idea?{" "}
        <Link href="/sugerencias" className="font-semibold text-primary underline underline-offset-2">
          Sugerencias y contacto
        </Link>
      </p>
    </main>
  );
}
