"use client";

import { CheckIcon, CopyIcon, HeartIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState } from "react";
import { DONATION_AMOUNTS_ARS, DONATION_MAX_ARS, DONATION_MIN_ARS, donationCheckoutSchema, type DonationCheckoutDto } from "@sala/contracts";
import { useHouseInterstitial } from "@/features/ads/ad-overlay-store";
import { apiPost } from "@/lib/api";
import { FIRST_CHECK_IN_KEY, FIRST_SEEN_KEY } from "@/lib/engagement";
import { useExitTransition } from "@/lib/useExitTransition";
import { useFocusTrap } from "@/lib/useFocusTrap";

export const DONATION_ALIAS = "golf.cabina.mulita";
const DONATION_BANK = "Banco Provincia";

/** When the mobile prompt was last dismissed; it comes back after PROMPT_EVERY_MS. */
const PROMPT_KEY = "donate-prompt-dismissed-at";
const PROMPT_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const PROMPT_DELAY_MS = 2500;

/** The alias as a tappable "ticket": tapping anywhere on it copies the alias. */
function AliasTicket() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(DONATION_ALIAS);
      setCopied(true);
    } catch {
      // Async clipboard blocked (old WebView, unfocused page): fall back to a hidden textarea + execCommand.
      const area = document.createElement("textarea");
      area.value = DONATION_ALIAS;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) setCopied(true);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? "Alias copiado" : `Copiar alias ${DONATION_ALIAS}`}
      className="group flex w-full items-center gap-3 rounded-control border border-dashed border-[var(--border-strong)] bg-surface-2 px-3 py-2.5 text-left transition-transform active:scale-[0.98]"
    >
      <span className="min-w-0 flex-1">
        <span className="t-label block truncate">Alias {DONATION_BANK}</span>
        <span className="t-data mt-0.5 block truncate text-[15px] font-semibold text-main">{DONATION_ALIAS}</span>
      </span>
      <span
        aria-hidden="true"
        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold ${
          copied ? "bg-[var(--seat-free)] text-white" : "bg-primary/10 text-primary group-hover:bg-primary/15"
        }`}
      >
        {copied ? <CheckIcon size={16} weight="bold" /> : <CopyIcon size={16} weight="bold" />}
        {copied ? "Copiado" : "Copiar"}
      </span>
      <span role="status" className="sr-only">
        {copied ? "Alias copiado" : ""}
      </span>
    </button>
  );
}

const formatArs = (n: number) => `$${n.toLocaleString("es-AR")}`;

/** Quick amounts or a custom one: each opens Mercado Pago Checkout Pro straight away. */
function MercadoPagoAmounts() {
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState("");
  const customAmount = Number(custom);
  const customValid = Number.isInteger(customAmount) && customAmount >= DONATION_MIN_ARS && customAmount <= DONATION_MAX_ARS;

  async function donate(amount: number) {
    if (busy != null) return;
    setBusy(amount);
    setFailed(false);
    try {
      const { initPoint } = await apiPost<DonationCheckoutDto>("/api/v1/donations/checkout", { amount }, donationCheckoutSchema);
      window.location.assign(initPoint);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="t-label">Donar con Mercado Pago</span>
      <div className="grid grid-cols-2 gap-2">
        {DONATION_AMOUNTS_ARS.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => void donate(amount)}
            disabled={busy != null}
            aria-busy={busy === amount}
            className="min-h-11 rounded-control bg-primary px-3 font-mono text-[15px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy === amount ? "Abriendo…" : formatArs(amount)}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (customValid) void donate(customAmount);
        }}
      >
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-control border border-app bg-surface px-3 focus-within:border-primary">
          <span aria-hidden="true" className="font-mono text-muted">$</span>
          <span className="sr-only">Otro monto en pesos</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Otro monto"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 7))}
            className="min-w-0 flex-1 bg-transparent font-mono text-base text-main outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!customValid || busy != null}
          className="min-h-11 shrink-0 rounded-control bg-primary px-4 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {busy != null && busy === customAmount ? "Abriendo…" : "Donar"}
        </button>
      </form>
      {custom && !customValid ? (
        <p className="text-xs text-muted">
          Entre {formatArs(DONATION_MIN_ARS)} y {formatArs(DONATION_MAX_ARS)}.
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-xs text-[var(--seat-occupied)]">
          No pudimos abrir Mercado Pago. Probá de nuevo o usá el alias.
        </p>
      ) : null}
    </div>
  );
}

function DonateBody() {
  return (
    <>
      <p className="text-sm leading-relaxed text-muted">
        La app es gratis. Si te sirve, cualquier aporte ayuda a pagar el servidor para que siga andando y no se caiga.
      </p>
      <MercadoPagoAmounts />
      <span className="t-label">O por transferencia</span>
      <AliasTicket />
    </>
  );
}

/** Inline card: left panel on desktop, below the people list on mobile. */
export function DonateCard() {
  return (
    <section aria-labelledby="donate-card-title" className="flex flex-col gap-3 border-t border-app pt-4">
      <h2 id="donate-card-title" className="t-title flex items-center gap-2">
        <HeartIcon aria-hidden="true" size={18} weight="fill" className="text-primary" />
        ¿Querés donar?
      </h2>
      <DonateBody />
    </section>
  );
}

/** Holds the prompt back until the visitor has checked in once or has been around for a day. */
function hasEngaged(): boolean {
  try {
    if (window.localStorage.getItem(FIRST_CHECK_IN_KEY)) return true;
    const firstSeen = Number(window.localStorage.getItem(FIRST_SEEN_KEY));
    return firstSeen > 0 && Date.now() - firstSeen >= 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function readDismissedAt(): number {
  try {
    return Number(window.localStorage.getItem(PROMPT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Mobile-only bottom sheet shown shortly after the app opens, at most once a week. `blocked` holds it
 * back while something more important is on screen (an open seat sheet, a dispute banner).
 */
export function DonatePrompt({ blocked }: { blocked: boolean }) {
  const [due, setDue] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const adOpen = useHouseInterstitial().open;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Date.now() - readDismissedAt() < PROMPT_EVERY_MS) return;
    if (!hasEngaged()) return;
    const id = window.setTimeout(() => setDue(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  const { closing, requestClose } = useExitTransition(() => setDismissed(true), 180);

  // Record the dismissal on tap, not after the exit animation, so closing the tab mid-animation still counts.
  function close() {
    try {
      window.localStorage.setItem(PROMPT_KEY, String(Date.now()));
    } catch {
      // Storage blocked: it just shows again next visit.
    }
    requestClose();
  }

  const visible = due && !dismissed && !blocked && !adOpen;

  useFocusTrap(dialogRef, { initialFocus: closeRef, onEscape: close, active: visible });

  if (!visible) return null;

  return (
    <div className={`${closing ? "backdrop-exit" : "backdrop-enter"} fixed inset-0 z-50 flex items-end bg-black/40`} onClick={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="donate-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className={`${closing ? "sheet-exit" : "sheet-enter"} flex w-full flex-col gap-3 rounded-t-sheet border-t border-app bg-surface px-5 pb-safe pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.18)]`}
      >
        <span aria-hidden="true" className="mx-auto h-1.5 w-11 rounded-full bg-[var(--border-strong)]" />
        <div className="flex items-start gap-3">
          <HeartIcon aria-hidden="true" size={20} weight="fill" className="mt-1 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <h2 id="donate-prompt-title" className="font-display text-xl font-extrabold uppercase leading-tight text-main">
              ¿Querés donar?
            </h2>
            <p className="text-sm text-muted">Ayudá a que la sala siga online.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[var(--surface-2)] hover:text-main"
          >
            <XIcon aria-hidden="true" size={18} />
          </button>
        </div>
        <DonateBody />
        <button
          type="button"
          onClick={close}
          className="mb-3 min-h-12 w-full rounded-control bg-[var(--surface-2)] px-4 text-sm font-semibold text-main"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
