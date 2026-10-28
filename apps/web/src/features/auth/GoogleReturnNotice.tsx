"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { googleReturnError } from "./google-sign-in";

export function GoogleReturnNotice({ pending, codeAvailable, onRetry, onUseCode }: {
  pending: boolean; codeAvailable: boolean; onRetry: () => void; onUseCode: () => void;
}) {
  const params = useSearchParams();
  const code = params.get("error");
  if (params.get("oauth") !== "google" || !code) return null;
  const issue = googleReturnError(code);
  return <section aria-label="Resultado del ingreso con Google" className="rounded-2xl border border-app bg-surface-2 p-4">
    <p role="alert" className="text-sm leading-relaxed text-main">{issue.message}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {issue.recovery === "support" ? <Link href="/proyecto" className="inline-flex min-h-11 items-center rounded-full border border-app px-4 text-sm font-semibold text-primary">Contactar</Link> : <>
        {issue.recovery !== "code" ? <button type="button" disabled={pending} onClick={onRetry} className="min-h-11 rounded-full border border-app px-4 text-sm font-semibold text-primary disabled:opacity-50">Volver a Google</button> : null}
        {codeAvailable ? <button type="button" disabled={pending} onClick={onUseCode} className="min-h-11 rounded-full border border-app px-4 text-sm font-semibold text-primary disabled:opacity-50">Usar código por email</button> : null}
      </>}
    </div>
  </section>;
}
