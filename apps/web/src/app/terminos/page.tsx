import type { Metadata } from "next";
import { BackButton } from "@/components/BackButton";

export const metadata: Metadata = { title: "Términos de uso" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-prose space-y-4 px-4 py-8 text-sm leading-relaxed text-main">
      <BackButton fallbackHref="/" />
      <h1 className="t-heading">Términos de uso</h1>
      <ul className="list-disc space-y-2 pl-5">
        <li>La información de ocupación es colaborativa y aproximada. No es una reserva ni garantiza que un lugar esté libre.</li>
        <li>&quot;Estoy acá&quot; significa que estás sentado en ese lugar ahora. No se pueden guardar lugares para otras personas.</li>
        <li>No publiques información falsa, contenido ofensivo ni acoso. Podemos limitar o suspender cuentas que lo hagan.</li>
        <li>El servicio se ofrece tal cual, sin garantías, y puede cambiar o interrumpirse.</li>
        <li>
          El uso de tus datos se rige por la{" "}
          <a className="text-primary underline" href="/privacidad">
            política de privacidad
          </a>
          .
        </li>
      </ul>
    </main>
  );
}
