import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import { FeedbackForm } from "@/features/feedback/FeedbackForm";
import { LEGAL_CONTACT } from "@/lib/legal";

export const metadata: Metadata = { title: "Sugerencias y contacto" };

export default function FeedbackPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Sugerencias y contacto</h1>
      <p className="text-muted">Contanos qué mejorarías, qué te preocupa o si algo no anda. Lo leemos nosotros.</p>
      <p>También podés escribir a <a href={`mailto:${LEGAL_CONTACT}`} className="break-all font-semibold text-primary underline underline-offset-4">{LEGAL_CONTACT}</a>, sin crear una cuenta ni usar el formulario.</p>
      <p className="text-muted">Para un error del mapa, indicá mesa, asiento, hora aproximada y qué hiciste antes de que pasara. Para corregir una guía, incluí su título y el fragmento. Evitá enviar contraseñas, códigos de acceso o información privada de otras personas.</p>
      <noscript><p className="rounded-2xl border border-app bg-surface p-4">El formulario necesita JavaScript. Podés usar el correo de contacto que aparece arriba.</p></noscript>
      <FeedbackForm />
    </main>
  );
}
