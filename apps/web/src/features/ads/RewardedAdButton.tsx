"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { notifySnoozeChanged } from "./ad-overlay-store";
import { snooze } from "./ad-policy";
import { getAdProvider } from "./ad-provider";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

type State = { kind: "idle" } | { kind: "loading" } | { kind: "granted"; until: number } | { kind: "unavailable" };

/** Opt-in rewarded ad: watching it earns a few ad-free hours. Renders nothing without a rewarded unit. */
export function RewardedAdButton() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const provider = getAdProvider("rewarded");
  if (!provider.isAvailable("rewarded")) return null;

  async function handleClick() {
    setState({ kind: "loading" });
    let outcome: Awaited<ReturnType<typeof provider.showRewarded>>;
    try {
      outcome = await provider.showRewarded();
    } catch {
      outcome = "unavailable";
    }
    if (outcome === "granted") {
      const until = snooze(Date.now(), window.localStorage);
      trackEvent("ad_reward", { provider: provider.id });
      notifySnoozeChanged();
      setState({ kind: "granted", until });
    } else if (outcome === "unavailable") {
      setState({ kind: "unavailable" });
    } else {
      setState({ kind: "idle" });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={state.kind === "loading"}
        className="min-h-11 rounded-control border border-app bg-surface px-4 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        {state.kind === "loading" ? "Cargando anuncio…" : "Mirá un anuncio y sacá los anuncios por 3 horas"}
      </button>
      <p role="status" className="text-xs text-muted empty:hidden">
        {state.kind === "granted"
          ? `Listo, sin anuncios hasta las ${formatTime(state.until)}`
          : state.kind === "unavailable"
            ? "No hay anuncios disponibles ahora, probá más tarde."
            : null}
      </p>
    </div>
  );
}
