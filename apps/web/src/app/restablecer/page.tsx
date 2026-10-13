"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Suspense, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { MIN_PASSWORD_LENGTH, resetErrorMessage, validateNewPassword } from "@/lib/password-reset";

export default function RestablecerPage() {
  return (
    <Suspense fallback={null}>
      <RestablecerForm />
    </Suspense>
  );
}

function RestablecerForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Kept in state so the token survives the cleanup of the address bar below.
  const [token] = useState(() => params.get("token"));
  const [urlError] = useState(() => params.get("error"));
  const linkError = token ? null : resetErrorMessage(urlError ?? "INVALID_TOKEN");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Keeps the one-time token out of the address bar / history once read.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!token) return;
    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(resetErrorMessage(result.error));
        return;
      }
      router.push("/login?restablecida=1");
    } catch {
      setError(resetErrorMessage({}));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-57px)] flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-center font-display text-2xl font-extrabold leading-snug text-main">Elegí una contraseña nueva</h1>

        {linkError ? (
          <div className="mt-6 flex flex-col gap-3 text-center">
            <p role="alert" className="text-sm text-red-600">{linkError}</p>
            <a
              href="/recuperar"
              className="flex min-h-11 items-center justify-center rounded-control bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Pedir un link nuevo
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder={`Contraseña nueva (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`}
              aria-label="Contraseña nueva"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-control border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
            />
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              placeholder="Repetí la contraseña"
              aria-label="Repetí la contraseña"
              name="confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="w-full rounded-control border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
            />

            {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-control bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
