import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { GUIDES } from "@/features/guides/guides";
import { GuideLibrary } from "@/features/guides/GuideLibrary";

export const metadata: Metadata = {
  title: "Guías de estudio",
  description: "Guías prácticas para estudiar mejor: Pomodoro, repaso espaciado, cómo preparar un final, organizar la semana y concentrarte en la sala.",
  alternates: { canonical: "/guias" },
};

export default function GuidesIndexPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-7 text-sm leading-relaxed text-main sm:pt-10">
      <BackButton fallbackHref="/" />
      <h1 className="text-3xl font-bold tracking-tight">Ideas para estudiar mejor</h1>
      <p className="text-muted">
        Guías de Sala de Estudio con ejemplos para organizar la cursada y los finales. Cada artículo incluye lecturas complementarias para profundizar.
      </p>

      <GuideLibrary guides={GUIDES.map(({ slug, title, description, readingMinutes }) => ({ slug, title, description, readingMinutes }))} />

      <p className="text-muted">
        <Link href="/proyecto#contenido" className="font-semibold text-primary underline underline-offset-2">Cómo se prepara este material y cómo pedir una corrección</Link>.
      </p>

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
