"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCardIcon, LeafIcon } from "@phosphor-icons/react/dist/ssr";
import {
  GARDEN_SEED_PACK,
  type GardenCheckoutDto,
  type GardenShopDto,
} from "@sala/contracts";
import { apiFetch } from "@/lib/api";

const STATUS: Record<string, string> = {
  pending: "Esperando confirmación",
  in_process: "En proceso",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reintegrado",
  charged_back: "Pago revertido",
  in_mediation: "En revisión",
};

export function SeedShop({ onCredit }: { onCredit: () => Promise<void> }) {
  const [shop, setShop] = useState<GardenShopDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(false);
  const creditRef = useRef(onCredit);
  useEffect(() => {
    creditRef.current = onCredit;
  }, [onCredit]);
  const load = useCallback(async () => {
    try {
      const data = await apiFetch<GardenShopDto>("/api/v1/me/garden/shop");
      if (mounted.current) {
        setShop(data);
        setError(null);
      }
      return data;
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "No pudimos cargar las compras.",
        );
      return null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let timer: number | undefined;
    let attempts = 0;
    const returned =
      new URLSearchParams(window.location.search).get("compra") === "pendiente";
    async function poll() {
      const data = await load();
      if (!mounted.current) return;
      if (returned) {
        await creditRef.current();
        const waiting =
          data?.orders[0]?.status === "pending" ||
          data?.orders[0]?.status === "in_process";
        setChecking(!!waiting);
        if (waiting && ++attempts < 12)
          timer = window.setTimeout(() => void poll(), 5000);
        else setChecking(false);
      }
    }
    void poll();
    return () => {
      mounted.current = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  async function buy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<GardenCheckoutDto>(
        "/api/v1/me/garden/checkout",
        { method: "POST", body: "{}" },
      );
      const checkout = new URL(result.initPoint);
      if (
        checkout.protocol !== "https:" ||
        !(
          checkout.hostname === "mercadopago.com.ar" ||
          checkout.hostname.endsWith(".mercadopago.com.ar")
        )
      )
        throw new Error("No pudimos abrir el pago. Intentá de nuevo.");
      window.location.assign(checkout.href);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "No pudimos abrir el pago.");
        setBusy(false);
      }
    }
  }
  const pack = shop?.pack ?? GARDEN_SEED_PACK;
  return (
    <section
      className="mt-6 rounded-2xl border border-app bg-surface p-5 sm:p-6"
      aria-labelledby="seed-shop-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-lg">
          <p className="t-label text-primary">Un extra para tu jardín</p>
          <h2 id="seed-shop-title" className="mt-2 text-xl font-bold">
            {pack.seeds} semillas · ${pack.priceArs.toLocaleString("es-AR")} ARS
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Compra única y opcional con Mercado Pago. También ganás semillas
            gratis estudiando. Comprar semillas no acelera el crecimiento: tus
            árboles necesitan tiempo en la sala.
          </p>
        </div>
        <button
          type="button"
          disabled={!shop?.enabled || busy}
          onClick={() => void buy()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-45"
        >
          <CreditCardIcon size={19} aria-hidden="true" />
          {busy ? "Abriendo Mercado Pago…" : "Comprar semillas"}
        </button>
      </div>
      {shop && !shop.enabled ? (
        <p className="mt-3 text-xs text-muted">
          Las compras todavía no están habilitadas. Podés seguir ganando
          semillas con tus horas de estudio.
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Se acreditan al confirmar el pago. Son bienes virtuales de esta cuenta,
        sin valor de retiro ni transferencia. Los reintegros y contracargos
        descuentan las semillas correspondientes.
      </p>
      {checking ? (
        <p role="status" className="mt-4 text-sm text-primary">
          Estamos esperando la confirmación de Mercado Pago. Tu saldo se
          actualizará al acreditarse.
        </p>
      ) : null}
      {shop?.orders.length ? (
        <details className="mt-5 border-t border-app pt-4">
          <summary className="cursor-pointer py-1 text-sm font-semibold">
            Mis últimas compras
          </summary>
          <ul className="mt-3 space-y-3">
            {shop.orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"
              >
                <span>{new Date(o.createdAt).toLocaleDateString("es-AR")}</span>
                <span className="inline-flex items-center gap-1.5">
                  {o.creditedSeeds > 0 ? (
                    <>
                      <LeafIcon size={15} aria-hidden="true" />
                      {o.creditedSeeds} semillas acreditadas
                    </>
                  ) : (
                    (STATUS[o.status] ?? "En revisión")
                  )}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              void load();
              void onCredit();
            }}
            className="mt-3 min-h-11 text-sm font-semibold text-primary"
          >
            Actualizar estado
          </button>
        </details>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-occupied">
          {error}{" "}
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => void load()}
          >
            Reintentar
          </button>
        </p>
      ) : null}
    </section>
  );
}
