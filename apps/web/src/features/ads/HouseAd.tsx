"use client";

import { ArmchairIcon, DeviceMobileIcon, ProhibitIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useMe } from "@/lib/me-store";

export interface HouseAdProps {
  variant: "interstitial" | "rail";
  /** Called when the visitor follows the call to action (the overlay closes itself). */
  onNavigate?: () => void;
}

/**
 * Our own promo, shown wherever a third-party ad is not configured. It sells the ad-free
 * subscription when that is on, and otherwise nudges visitors to install the app.
 */
export function HouseAd({ variant, onNavigate }: HouseAdProps) {
  const { me } = useMe();
  const promoteSubscription = !!me?.subscriptionsEnabled && !me.adFree;
  const price = me?.subscriptionPriceArs;

  const Icon = promoteSubscription ? ProhibitIcon : DeviceMobileIcon;
  const title = promoteSubscription ? "Sala de Estudio Pro" : "Tu sala, a un toque";
  const body = promoteSubscription
    ? `Sin anuncios y con todo Foco, en todos tus dispositivos. $${(price ?? 1500).toLocaleString("es-AR")} por mes y cancelás cuando quieras.`
    : "Agregá Sala de Estudio a tu pantalla de inicio y mirá los lugares libres sin abrir el navegador.";
  const hint = "Desde el menú del navegador: Agregar a pantalla de inicio.";

  if (variant === "rail") {
    return (
      <div className="flex h-full w-full flex-col items-start gap-3 rounded-control border border-app bg-surface p-3">
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-control bg-primary text-white">
          <Icon size={22} weight="bold" />
        </span>
        <p className="font-display text-[15px] font-extrabold uppercase leading-[1.1] tracking-[0.01em] text-main">{title}</p>
        <p className="text-xs leading-snug text-muted">{body}</p>
        {promoteSubscription ? (
          <Link
            href="/suscripcion"
            className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Sacar anuncios
          </Link>
        ) : (
          <p className="mt-auto text-[11px] leading-snug text-faint">{hint}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-primary text-white">
          {promoteSubscription ? <ArmchairIcon size={26} weight="bold" /> : <Icon size={26} weight="bold" />}
        </span>
        <h2 className="t-title">{title}</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
      {promoteSubscription ? (
        <Link
          href="/suscripcion"
          onClick={onNavigate}
          className="inline-flex min-h-[52px] items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Quiero sacar los anuncios
        </Link>
      ) : (
        <p className="rounded-control bg-surface-2 px-3 py-2.5 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
