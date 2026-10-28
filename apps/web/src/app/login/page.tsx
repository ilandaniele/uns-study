"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { authClient, signIn, signUp, useSession } from "@/lib/auth-client";
import { EmailCodeForm, emailCodeError } from "@/features/auth/EmailCodeForm";
import { invalidateMe } from "@/lib/me-store";
import { safeNextPath } from "@/lib/safe-next";
import { resetSocket } from "@/lib/socket";
import { secureWebUrl } from "@/lib/hosts";
import { googleSignInError } from "@/features/auth/google-sign-in";

type Tab = "signin" | "signup";

function safeNext(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"), window.location.origin);
}

/** An already-open HTTP tab must move to HTTPS before submitting any credentials. */
function redirectToSecureLogin(): boolean {
  const target = secureWebUrl(window.location.href);
  if (!target) return false;
  window.location.replace(target);
  return true;
}

function authErrorMessage(error: { code?: string; status?: number }): string {
  const code = error.code ?? "";
  if (error.status === 429) return "Demasiados intentos. Esperá un momento.";
  if (code === "INVALID_EMAIL_OR_PASSWORD") return "El email o la contraseña no coinciden. Revisalos y probá de nuevo.";
  if (code.startsWith("USER_ALREADY_EXISTS")) return "Ya hay una cuenta con ese email. Tocá «Ingresar».";
  if (code === "PASSWORD_TOO_SHORT") return "La contraseña tiene que tener al menos 8 caracteres.";
  if (code === "INVALID_EMAIL") return "Email inválido.";
  if (code === "EMAIL_NOT_VERIFIED") return "Confirmá tu email con un código para continuar.";
  return "No pudimos ingresar. Revisá tu conexión y probá de nuevo.";
}

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [name, setName] = useState("");
  const [emailInput, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false);
  const [providers, setProviders] = useState({ loaded: false, otp: false, required: true });
  const [methodInput, setMethod] = useState<"password" | "code" | null>(null);
  const [verification, setVerification] = useState<{ email: string; name?: string } | null>(null);
  const busy = useRef(false);
  const { data: session } = useSession();
  const legacyEmail = session?.user && !session.user.emailVerified && providers.required ? session.user.email : "";
  const email = emailInput ?? legacyEmail;
  const method = methodInput ?? (legacyEmail ? "code" : "password");

  useEffect(() => {
    apiFetch<{ google: boolean; passwordReset?: boolean; emailOtp?: boolean; emailVerificationRequired?: boolean }>("/api/v1/auth-providers")
      .then((p) => {
        setGoogleEnabled(p.google);
        setPasswordResetEnabled(Boolean(p.passwordReset));
        setProviders({ loaded: true, otp: Boolean(p.emailOtp), required: p.emailVerificationRequired !== false });
      })
      .catch(() => { setGoogleEnabled(false); setProviders({ loaded: true, otp: false, required: true }); });
  }, []);

  function completeSignIn() {
    invalidateMe(); resetSocket();
    router.push(safeNext() ?? "/"); router.refresh();
  }

  async function requestCode() {
    const address = email.trim().toLowerCase();
    const result = await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    if (result.error) { setError(emailCodeError(result.error)); return; }
    setPassword("");
    setVerification({ email: address, ...(tab === "signup" && name.trim() ? { name: name.trim() } : {}) });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || redirectToSecureLogin()) return;
    busy.current = true;
    setError(null);
    setPending(true);
    try {
      if ((tab === "signup" && providers.required) || (tab === "signin" && method === "code")) {
        await requestCode();
        return;
      }
      const result =
        tab === "signin"
          ? await signIn.email({ email, password })
          : await signUp.email({ email, password, name: name || email.split("@")[0] });

      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED" && providers.otp) { await requestCode(); return; }
        setError(authErrorMessage(result.error));
        return;
      }
      // Picks up the new session's token instead of carrying an anonymous socket into the room page.
      completeSignIn();
    } catch {
      setError("No pudimos ingresar. Revisá tu conexión y probá de nuevo.");
    } finally {
      setPending(false);
      busy.current = false;
    }
  }

  async function handleGoogle() {
    if (busy.current || redirectToSecureLogin()) return;
    busy.current = true;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setError(null);
    setPending(true);
    try {
      const result = await signIn.social({ provider: "google", callbackURL: `${origin}${safeNext() ?? "/"}` });
      if (result?.error) setError(googleSignInError(result.error));
    } catch {
      setError(googleSignInError());
    } finally {
      setPending(false);
      busy.current = false;
    }
  }

  return (
    <main className="flex min-h-[calc(100dvh-65px)] flex-col items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-center font-display text-2xl font-extrabold leading-snug text-main">
          Marcá tu lugar. Ayudá a que otros encuentren el suyo.
        </h1>

        {verification ? <EmailCodeForm {...verification} onComplete={completeSignIn} onBack={() => { setVerification(null); setError(null); }} /> : <>

        <div className="mt-6 mb-4 flex rounded-control bg-surface-2 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => { setTab("signin"); setError(null); }}
            disabled={pending}
            aria-pressed={tab === "signin"}
            className={`flex-1 rounded-control py-2 transition-colors ${
              tab === "signin" ? "bg-primary text-white" : "text-muted"
            }`}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => { setTab("signup"); setError(null); }}
            disabled={pending}
            aria-pressed={tab === "signup"}
            className={`flex-1 rounded-control py-2 transition-colors ${
              tab === "signup" ? "bg-primary text-white" : "text-muted"
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {googleEnabled ? (
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-control border border-app px-3 py-2.5 text-sm font-semibold text-main hover:bg-surface-2 disabled:opacity-50"
          >
            <GoogleGlyph />
            Continuar con Google
          </button>
        ) : null}

        {googleEnabled ? (
          <div className="my-4 flex items-center gap-2 text-xs text-muted">
            <div className="h-px flex-1 bg-app" />o<div className="h-px flex-1 bg-app" />
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === "signup" ? (
            <input
              type="text"
              placeholder="Nombre"
              aria-label="Nombre"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-control border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
            />
          ) : null}
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
          {(tab === "signin" && method === "password") || (tab === "signup" && !providers.required) ? <input
            type="password"
            required
            minLength={8}
            placeholder={tab === "signup" ? "Contraseña (mínimo 8 caracteres)" : "Contraseña"}
            aria-label="Contraseña"
            name="password"
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-control border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
          /> : null}

          {(tab === "signup" && providers.required) || method === "code" ? <p className="text-sm text-muted">Te enviaremos un código de 6 dígitos. Tu cuenta se habilita sólo al confirmar que el email es tuyo.</p> : null}
          {providers.loaded && providers.required && !providers.otp && (tab === "signup" || method === "code") ? <p role="alert" className="text-sm text-muted">El envío de códigos no está disponible en este momento. Probá más tarde{googleEnabled ? " o ingresá con Google" : ""}.</p> : null}

          {tab === "signin" && method === "password" && passwordResetEnabled ? (
            <a href="/recuperar" className="self-end text-xs text-muted underline">
              ¿Olvidaste tu contraseña?
            </a>
          ) : null}

          {error ? null : (
            <Suspense fallback={null}>
              <ResetDoneNotice />
            </Suspense>
          )}
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={pending || !providers.loaded || (providers.required && !providers.otp && (tab === "signup" || method === "code"))}
            className="min-h-11 rounded-control bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? "Un momento…" : ((tab === "signup" && providers.required) || method === "code") ? "Enviar código" : tab === "signin" ? "Ingresar" : "Crear cuenta"}
          </button>
          {tab === "signin" && providers.otp ? <button type="button" disabled={pending} onClick={() => { setMethod(method === "code" ? "password" : "code"); setPassword(""); setError(null); }} className="min-h-11 text-sm font-semibold text-primary">{method === "code" ? "Ingresar con contraseña" : "Ingresar con un código por email"}</button> : null}
        </form>
        </>}

        <p className="mt-6 text-center text-xs text-muted">
          Al continuar aceptás los{" "}
          <a href="/terminos" className="underline">
            términos
          </a>{" "}
          y la{" "}
          <a href="/privacidad" className="underline">
            política de privacidad
          </a>
          .
        </p>
      </div>
    </main>
  );
}

/** Shown after a successful password reset (`/login?restablecida=1`). */
function ResetDoneNotice() {
  const done = useSearchParams().get("restablecida") === "1";
  return done ? <p role="status" className="text-sm text-main">Listo, cambiaste tu contraseña. Ingresá con la nueva.</p> : null;
}

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.59-5.17 3.59-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.75l4-3.11Z" />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.58 1.79l3.44-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.1C6.22 6.87 8.87 4.76 12 4.76Z"
      />
    </svg>
  );
}
