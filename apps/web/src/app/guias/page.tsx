import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { GUIDES } from "@/features/guides/guides";

export const metadata: Metadata = {
  title: "Guías de estudio",
  description: "Guías prácticas para estudiar mejor: Pomodoro, repaso espaciado, cómo preparar un final, organizar la semana y concentrarte en la sala.",
  alternates: { canonical: "/guias" },
};

export default function GuidesIndexPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Guías de estudio</h1>
      <p className="text-muted">
        Técnicas concretas para rendir mejor en la cursada y en los finales, escritas por quienes usan la sala todos los
        días.
      </p>

      <ul className="flex flex-col divide-y divide-[var(--border)] border-y border-app">
        {GUIDES.map((guide) => (
          <li key={guide.slug} className="py-4">
            <Link href={`/guias/${guide.slug}`} className="group block">
              <h2 className="text-base font-semibold text-main group-hover:text-primary group-hover:underline">
                {guide.title}
              </h2>
              <p className="mt-1 text-muted">{guide.description}</p>
              <p className="mt-1 font-mono text-xs text-faint">{guide.readingMinutes} min de lectura</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-muted">
        ¿Querés saber cómo funciona el mapa de la sala?{" "}
        <Link href="/como-usar" className="font-semibold text-primary underline underline-offset-2">
          Cómo usar Sala de Estudio
        </Link>
        .
      </p>
    </main>
  );
}
