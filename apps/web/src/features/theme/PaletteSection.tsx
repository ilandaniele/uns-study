"use client";

import { useEffect, useState } from "react";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { usePro } from "@/features/subscriptions/usePro";
import { applyPalette, getStoredPalette } from "@/lib/theme";
import { PALETTE_META, PALETTES, type Palette } from "./palette";

/**
 * Pro: accent palette picker on the profile. Locked users see the swatches disabled; tapping one opens the
 * upsell. A lapsed subscriber keeps a cosmetic palette until they open this page, where it resets to default.
 */
export function PaletteSection() {
  const { lock } = usePro();
  const [palette, setPalette] = useState<Palette>("default");

  useEffect(() => {
    const stored = getStoredPalette();
    if (lock === "locked" && stored !== "default") {
      applyPalette("default");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to localStorage, unavailable during SSR/first render
      setPalette("default");
      return;
    }
    setPalette(stored);
  }, [lock]);

  if (lock === "unknown") return null;
  const locked = lock === "locked";

  function choose(next: Palette) {
    if (locked) {
      openProUpsell("themes");
      return;
    }
    setPalette(next);
    applyPalette(next);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {locked ? "Elegí los colores de la app con Sala de Estudio Pro." : "Elegí el color principal de la app. Los colores de los lugares no cambian."}
      </p>
      <div role="radiogroup" aria-label="Paleta de colores" className="flex flex-wrap gap-3">
        {PALETTES.map((p) => {
          const selected = !locked && palette === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={locked}
              onClick={() => choose(p)}
              className={`flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm text-main ${
                selected ? "border-2 border-[var(--primary)] font-semibold" : "border-app"
              } ${locked ? "opacity-60" : "hover:bg-surface-2"}`}
            >
              <span aria-hidden="true" className="h-5 w-5 rounded-full border border-app" style={{ backgroundColor: PALETTE_META[p].swatch }} />
              {PALETTE_META[p].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
