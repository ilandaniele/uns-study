"use client";

import type { SubscriptionDto } from "@sala/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "@/lib/api";
import { refreshMe, useMe } from "@/lib/me-store";
import { cancelSubscription, fetchSubscription, startCheckout } from "./api";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";

const POLL_MS = 3000;
const POLL_MAX = 10;

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return "No pudimos completar la acción. Probá de nuevo en un rato.";
}

export function SubscriptionPageClient() {
  const { me, loading: meLoading } = useMe();
  const searchParams = useSearchParams();
  const returning = searchParams.get("estado") === "ok";
  const signedIn = Boolean(me?.user);

  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(returning);

  const load = useCallback(async () => {
    try {
      const next = await fetchSubscription();
      setSub(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (signedIn) void fetchSubscription().then(setSub, () => undefined);
  }, [signedIn]);

  // Back from Mercado Pago: the webhook may land a few seconds later, so poll until authorized.
  useEffect(() => {
    if (!returning || !signedIn) return;
    let cancelled = false;
    let attempts = 0;
    void refreshMe().catch(() => undefined);
    const timer = setInterval(() => {
      attempts += 1;
      void load().then((next) => {
        if (cancelled) return;
        if (next?.status === "authorized") {
          setPolling(false);
          void refreshMe().catch(() => undefined);
          clearInterval(timer);
        } else if (attempts >= POLL_MAX) {
          setPolling(false);
          clearInterval(timer);
        }
      });
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [returning, signedIn, load]);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      const { initPoint } = await startCheckout();
      window.location.assign(initPoint);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      setSub(await cancelSubscription());
      setConfirming(false);
      void refreshMe().catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const price = me?.subscriptionPriceArs ?? sub?.priceArs;
  const enabled = me?.subscriptionsEnabled ?? sub?.enabled ?? false;
  const authorized = sub?.status === "authorized";
  const until = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <main className="mx-auto max-w-prose space-y-6 px-4 py-8 text-main">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">Sala de Estudio sin anuncios</h1>
        {price !== undefined && <p className="text-lg font-semibold text-primary">${price}/mes</p>}
      </header>

      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>Sin anuncios en ningún dispositivo</li>
        <li>Apoyás que la sala siga funcionando</li>
      </ul>

      <section className="rounded-xl border border-app bg-surface p-4">
        {meLoading ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : !enabled ? (
          <p className="text-sm text-muted">Muy pronto</p>
        ) : !signedIn ? (
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white active:scale-[0.98]"
          >
            Ingresá para suscribirte
          </Link>
        ) : authorized ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">{until ? `Activa hasta ${until}` : "Tu suscripción está activa"}</p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-11 rounded-xl border border-app px-4 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
            >
              Cancelar suscripción
            </button>
          </div>
        ) : polling ? (
          <p role="status" className="text-sm text-muted">
            Estamos confirmando tu pago…
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={busy}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Redirigiendo…" : "Suscribirme"}
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {confirming && <CancelSubscriptionDialog pending={busy} onConfirm={() => void handleCancel()} onCancel={() => setConfirming(false)} />}
    </main>
  );
}
