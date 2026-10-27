"use client";

import { FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN, type FeedbackCategory } from "@sala/contracts";
import { type FormEvent, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api";
import { describeActionError } from "@/lib/errors";
import { useMe } from "@/lib/me-store";
import { TurnstileChallenge } from "@/features/room/TurnstileChallenge";
import { FEEDBACK_CATEGORY_OPTIONS, feedbackCategoryLabel } from "./categories";
import { submitFeedback } from "./submitFeedback";

export function FeedbackForm({ compact = false }: { compact?: boolean }) {
  const { me, loading: meLoading } = useMe();
  const signedIn = Boolean(me?.user);
  const [category, setCategory] = useState<FeedbackCategory>("SUGGESTION");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const tooShort = message.trim().length < FEEDBACK_MESSAGE_MIN;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await send(null);
  }

  async function send(turnstileToken: string | null): Promise<boolean> {
    if (busy.current || tooShort) return false;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await submitFeedback({
        category,
        message,
        email: signedIn ? undefined : email,
        turnstileToken,
      });
      setSent(true);
      return true;
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "TURNSTILE_REQUIRED") {
        // Anonymous senders get the widget only when the API asks for it; the token is single-use.
        setTurnstileRequired(true);
        setError(turnstileToken ? "No pudimos confirmar que sos una persona. Probá de nuevo." : null);
      } else if (err instanceof ApiRequestError && err.code === "RATE_LIMITED") {
        setError("Ya enviaste varios mensajes. Probá de nuevo en unos minutos.");
      } else if (err instanceof ApiRequestError && err.code === "VALIDATION_ERROR") {
        setError("Revisá el mensaje y el email: no pudimos enviarlo con esos datos.");
      } else {
        setError(describeActionError(err));
      }
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function handleAnother() {
    setMessage("");
    setCategory("SUGGESTION");
    setTurnstileRequired(false);
    setError(null);
    setSent(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 border-y border-app py-6 text-center" role="status">
        <p className="t-title">¡Gracias! Recibimos tu mensaje.</p>
        <button
          type="button"
          onClick={handleAnother}
          className="min-h-11 rounded-control border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-surface-2"
        >
          Enviar otro
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-app pt-6">
      {!compact ? <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-main">Sobre qué querés escribirnos</legend>
        <div className="grid grid-cols-2 gap-2">
          {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
            <label
              key={option}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-3 py-2 text-center text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--primary)] ${
                option === category ? "border-transparent bg-primary text-white" : "border-app text-main hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="category"
                value={option}
                checked={option === category}
                onChange={() => setCategory(option)}
                className="sr-only"
              />
              {feedbackCategoryLabel(option)}
            </label>
          ))}
        </div>
      </fieldset> : null}

      <label className="flex flex-col gap-1 text-sm font-semibold text-main">
        Mensaje
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, FEEDBACK_MESSAGE_MAX))}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={compact ? 3 : 6}
          required
          placeholder={compact ? "¿Qué cambiarías o mejorarías?" : "Escribí acá lo que quieras contarnos"}
          className="resize-y rounded-control border border-app bg-surface px-3 py-2 text-base font-normal text-main sm:text-sm"
        />
        <span className="text-right text-xs font-normal text-muted">
          {message.length}/{FEEDBACK_MESSAGE_MAX}
        </span>
      </label>

      {!meLoading && !signedIn ? (
        <label className="flex flex-col gap-1 text-sm font-semibold text-main">
          Tu email (opcional), si querés que te respondamos
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            className="min-h-11 rounded-control border border-app bg-surface px-3 py-2 text-base font-normal text-main sm:text-sm"
          />
        </label>
      ) : null}

      {turnstileRequired && !tooShort ? <TurnstileChallenge onToken={send} /> : null}

      {error ? (
        <p role="alert" className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || tooShort || turnstileRequired}
        className="min-h-11 rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "Enviando…" : turnstileRequired ? "Verificá para enviar" : compact ? "Enviar sugerencia" : "Enviar"}
      </button>
    </form>
  );
}
