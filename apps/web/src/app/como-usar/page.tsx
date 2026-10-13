import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { HOW_TO_STEPS } from "@/features/help/how-to-steps";

export const metadata: Metadata = { title: "Cómo usar" };

const FAQ: { q: string; a: string }[] = [
  { q: "¿Puedo reservar un lugar?", a: "No, no hay reservas. Los lugares son para quien está sentado ahí." },
  {
    q: "¿Por qué me pide la ubicación?",
    a: "Para comprobar que estás cerca de la sala cuando marcás «Estoy acá». No guardamos tus coordenadas exactas ni las mostramos a nadie.",
  },
  { q: "¿Qué pasa si me olvido de liberar mi lugar?", a: "Se libera solo cuando se cumple el tiempo que elegiste, como máximo a las 3 horas." },
  { q: "¿Tengo que escanear un QR?", a: "No. Alcanza con tocar tu lugar en el mapa." },
];

export default function HowToUsePage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="font-display text-2xl font-semibold text-main">Cómo usar Sala de Estudio</h1>
      <p className="text-muted">Mirá qué lugares están libres antes de ir, y ayudá a mantener el mapa al día.</p>

      <ol className="flex flex-col gap-3">
        {HOW_TO_STEPS.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3 rounded-[14px] border border-app bg-surface p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <step.icon aria-hidden="true" size={20} weight="bold" />
            </span>
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
        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Ir a la sala
      </Link>
    </main>
  );
}
