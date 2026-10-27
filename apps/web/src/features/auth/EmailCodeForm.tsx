"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function emailCodeError(error: { code?: string; status?: number }): string {
  if (error.status === 429) return "Demasiados intentos. Esperá un momento antes de volver a probar.";
  if (error.code === "OTP_EXPIRED") return "El código venció. Pedí uno nuevo.";
  if (error.code === "TOO_MANY_ATTEMPTS") return "Agotaste los intentos de este código. Pedí uno nuevo.";
  if (error.code === "INVALID_OTP") return "El código no es válido. Revisá los 6 números o pedí uno nuevo.";
  if (error.code === "ACCOUNT_BANNED") return "Tu cuenta está suspendida.";
  if (error.code === "INVALID_EMAIL") return "Revisá la dirección de email.";
  return "No pudimos completar la verificación. Revisá tu conexión y volvé a intentar.";
}

/** Proof happens on the server; no password, code or token is stored in browser storage. */
export function EmailCodeForm({ email, name, onComplete, onBack }: { email: string; name?: string; onComplete: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("Te enviamos un código. Revisá también la carpeta de spam.");
  const [cooldown, setCooldown] = useState(60);
  const [resendAt, setResendAt] = useState(() => Date.now() + 60_000);
  const busy = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setCooldown(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  function waitForResend() { setResendAt(Date.now() + 60_000); setCooldown(60); }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const result = await authClient.signIn.emailOtp({ email, otp: code, ...(name ? { name } : {}) });
      if (result.error) setError(emailCodeError(result.error));
      else onComplete();
    } catch { setError("No pudimos verificar el código. Revisá tu conexión y volvé a intentar."); }
    finally { busy.current = false; setPending(false); }
  }

  async function resend() {
    if (busy.current || cooldown > 0) return;
    busy.current = true; setPending(true); setError(null); setNotice("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (result.error) { setError(emailCodeError(result.error)); if (result.error.status === 429) waitForResend(); }
      else { setCode(""); waitForResend(); setNotice("Enviamos un código nuevo. Usá el último que recibiste."); }
    } catch { setError("No pudimos enviar el código. Volvé a intentar en un momento."); }
    finally { busy.current = false; setPending(false); }
  }

  return <section className="mt-6 flex flex-col gap-4" aria-labelledby="email-code-title">
    <div>
      <h2 id="email-code-title" className="text-xl font-bold text-main">Confirmá tu email</h2>
      <p className="mt-2 break-words text-sm text-muted">Ingresá el código enviado a <strong className="text-main">{email}</strong>. Vence en 10 minutos.</p>
    </div>
    <form onSubmit={verify} className="flex flex-col gap-3">
      <label htmlFor="email-code" className="text-sm font-semibold text-main">Código de 6 dígitos</label>
      <input id="email-code" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus
        value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-describedby="email-code-notice" aria-invalid={Boolean(error)}
        className="min-h-12 w-full rounded-control border border-app bg-surface px-3 py-2 text-center font-mono text-2xl tracking-[.35em] text-main" />
      {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <p id="email-code-notice" role="status" className="text-sm text-muted">{notice}</p>
      <button type="submit" disabled={pending || code.length !== 6} className="min-h-11 rounded-control bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Verificando…" : "Confirmar e ingresar"}</button>
    </form>
    <button type="button" disabled={pending || cooldown > 0} onClick={() => void resend()} className="min-h-11 rounded-control border border-app px-3 text-sm font-semibold text-main disabled:opacity-50">{cooldown > 0 ? `Pedir otro código en ${cooldown} s` : "Enviar otro código"}</button>
    <button type="button" disabled={pending} onClick={onBack} className="min-h-11 text-sm font-semibold text-primary">Cambiar email o volver</button>
  </section>;
}
