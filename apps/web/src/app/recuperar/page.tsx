"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { RATE_LIMITED_MESSAGE, RESET_REQUEST_NEUTRAL_MESSAGE } from "@/lib/password-reset";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: "/restablecer" });
      if (result.error?.status === 429) {
        setError(RATE_LIMITED_MESSAGE);
        return;
      }
      // Same confirmation whether or not the email has an account.
      setSent(true);
    } catch {
      setError("No pudimos enviar el pedido. Revisá tu conexión y probá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-65px)] flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-center font-display text-2xl font-extrabold leading-snug text-main">Recuperá tu contraseña</h1>

        {sent ? (
          <p role="status" className="mt-6 text-center text-sm text-main">
            {RESET_REQUEST_NEUTRAL_MESSAGE}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <p className="text-sm text-muted">Ingresá tu email y te mandamos un link para elegir una contraseña nueva.</p>
            <input
              type="email"
              required
              placeholder="Email"
              aria-label="Email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-control border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
            />

            {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-control bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {pending ? "Enviando…" : "Enviar link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          <a href="/login" className="underline">
            Volver a ingresar
          </a>
        </p>
      </div>
    </main>
  );
}
