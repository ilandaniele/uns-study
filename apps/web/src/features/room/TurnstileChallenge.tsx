"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { isProductionHost } from "@/lib/hosts";

/** Public site key of the production widget; Cloudflare only accepts it on this hostname. */
const PROD_SITE_KEY = "0x4AAAAAAFMTxb6ekwDzFR5E";
const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
  (isProductionHost() ? PROD_SITE_KEY : undefined);

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback": () => boolean;
          "expired-callback": () => void;
          "timeout-callback": () => void;
          retry: "never";
          "refresh-expired": "manual";
          "refresh-timeout": "manual";
          size: "flexible" | "compact";
          language: "es";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export interface TurnstileChallengeProps {
  onToken: (token: string) => void | Promise<boolean>;
}

/**
 * Cloudflare Turnstile challenge shown inline in SeatDetail when the API answers
 * TURNSTILE_REQUIRED. Without a configured site key we can't render the widget,
 * so we just surface the explanatory copy (per spec, action stays blocked).
 */
export function TurnstileChallenge({ onToken }: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!scriptReady || !SITE_KEY || !containerRef.current || !window.turnstile) return;
    let active = true;
    let consumed = false;
    const fail = (message: string) => {
      if (!active || consumed) return;
      consumed = true;
      setError(message);
    };
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      size: containerRef.current.clientWidth < 300 ? "compact" : "flexible",
      language: "es",
      retry: "never",
      "refresh-expired": "manual",
      "refresh-timeout": "manual",
      "error-callback": () => {
        fail("No pudimos cargar la verificación. Revisá tu conexión y volvé a intentar.");
        return true;
      },
      "expired-callback": () => fail("La verificación venció. Volvé a verificar para continuar."),
      "timeout-callback": () => fail("Se agotó el tiempo de la verificación. Podés intentarlo de nuevo."),
      callback: (token) => {
        if (!active || consumed) return;
        consumed = true;
        setVerifying(true);
        setError(null);
        void (async () => {
          try {
            const ok = await onTokenRef.current(token);
            if (active && ok === false) setError("No se pudo completar la acción. Volvé a verificar para intentarlo de nuevo.");
          } catch {
            if (active) setError("No se pudo completar la acción. Revisá tu conexión y volvé a verificar.");
          } finally {
            if (active) setVerifying(false);
          }
        })();
      },
    });
    return () => {
      active = false;
      window.turnstile?.remove(widgetId);
    };
  }, [scriptReady, attempt]);

  return (
    <div className="min-w-0 rounded-control border border-app bg-surface-2 p-3" aria-busy={verifying}>
      <p className="text-sm font-medium text-main">Confirmá que sos una persona para continuar.</p>
      {SITE_KEY ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
            onError={() => setError("No pudimos cargar la verificación. Revisá tu conexión y volvé a intentar.")}
          />
          <div ref={containerRef} className="mt-3 min-w-0" />
          {verifying ? <p role="status" className="mt-2 text-sm text-muted">Verificando y reintentando tu acción…</p> : null}
          {error ? (
            <div className="mt-2 space-y-2">
              <p role="alert" className="text-sm text-main">{error}</p>
              <button type="button" className="min-h-11 rounded-control border border-app px-4 py-2 text-sm font-semibold text-main hover:bg-surface" disabled={verifying} onClick={() => {
                setError(null);
                if (!scriptReady) { window.location.reload(); return; }
                setAttempt((value) => value + 1);
              }}>Volver a verificar</button>
            </div>
          ) : null}
        </>
      ) : <p role="alert" className="mt-2 text-sm text-muted">La verificación no está disponible. Recargá la página para volver a intentar.</p>}
    </div>
  );
}
