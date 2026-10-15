import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";
import { FeedbackForm } from "@/features/feedback/FeedbackForm";

export const metadata: Metadata = { title: "Sugerencias y contacto" };

export default function FeedbackPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Sugerencias y contacto</h1>
      <p className="text-muted">Contanos qué mejorarías, qué te preocupa o si algo no anda. Lo leemos nosotros.</p>
      <FeedbackForm />
    </main>
  );
}
