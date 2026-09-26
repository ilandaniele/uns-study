"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

type Tab = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result =
        tab === "signin"
          ? await signIn.email({ email, password })
          : await signUp.email({ email, password, name: name || email.split("@")[0] });

      if (result.error) {
        setError(result.error.message ?? "No pudimos completar la operación.");
        return;
      }
      router.push("/sala/principal");
      router.refresh();
    } catch {
      setError("No pudimos completar la operación. Intentá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await signIn.social({ provider: "google", callbackURL: `${origin}/sala/principal` });
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">UNS Study</h1>

      <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setTab("signin")}
          className={`flex-1 rounded-md py-2 ${tab === "signin" ? "bg-white text-primary shadow" : "text-slate-500"}`}
        >
          Ingresar
        </button>
        <button
          type="button"
          onClick={() => setTab("signup")}
          className={`flex-1 rounded-md py-2 ${tab === "signup" ? "bg-white text-primary shadow" : "text-slate-500"}`}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {tab === "signup" ? (
          <input
            type="text"
            placeholder="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        ) : null}
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Contraseña"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {tab === "signin" ? "Ingresar" : "Crear cuenta"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-2 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />o<div className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={() => void handleGoogle()}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Continuar con Google
      </button>
    </main>
  );
}
