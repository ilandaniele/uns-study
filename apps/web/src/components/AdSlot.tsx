const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export type AdPlacement = "room-bottom" | "community-feed";

/**
 * Renders an AdSense placeholder slot, or nothing at all when `NEXT_PUBLIC_ADSENSE_CLIENT`
 * isn't configured. Intentionally inert (no script injection) until real ad units are decided;
 * kept as a stable mount point so pages can place it without knowing ad configuration details.
 */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  if (!ADSENSE_CLIENT) return null;

  return (
    <div
      data-ad-placement={placement}
      data-ad-client={ADSENSE_CLIENT}
      className="flex min-h-[90px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 text-xs text-slate-400"
    >
      Espacio publicitario
    </div>
  );
}
