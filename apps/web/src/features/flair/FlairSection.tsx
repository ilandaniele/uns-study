"use client";

import { NAME_COLORS, PROFILE_FRAMES, type NameColorId, type ProfileFrameId } from "@sala/contracts";
import { Avatar } from "@/components/Avatar";
import { FRAME_META, NAME_COLOR_META, nameColorStyle } from "@/components/flair";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { usePro } from "@/features/subscriptions/usePro";
import { useMyCosmetics } from "./useMyCosmetics";

const CHOICE_CLASS = "flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm text-main";

/**
 * Pro: avatar frame and name color picker on the profile, with a live preview. Locked users see the
 * options disabled with a defaults preview; tapping one opens the upsell.
 */
export function FlairSection({ userId, name, avatarUrl }: { userId: string; name: string; avatarUrl: string | null }) {
  const { lock } = usePro();
  const { data, saving, error, save } = useMyCosmetics();

  if (lock === "unknown") return null;
  const locked = lock === "locked";
  const frame: ProfileFrameId = locked ? "none" : (data?.frame ?? "none");
  const nameColor: NameColorId = locked ? "default" : (data?.nameColor ?? "default");

  function choose(next: { frame?: ProfileFrameId; nameColor?: NameColorId }) {
    if (locked) {
      openProUpsell("profile_flair");
      return;
    }
    void save({ frame, nameColor, ...next });
  }

  return (
    <div className="space-y-3 border-t border-app pt-4">
      {locked ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-main">
          Perfil destacado
          <ProBadge inline />
        </p>
      ) : (
        <p className="text-sm font-semibold text-main">Perfil destacado</p>
      )}
      <p className="text-sm text-muted">
        {locked ? "Con Sala de Estudio Pro elegís cómo te ven en el ranking, en tu perfil y en la sala." : "Elegí cómo te ven en el ranking, en tu perfil y en la sala."}
      </p>
      {!locked && data && !data.visibleToOthers ? (
        <p className="text-xs text-muted">Por ahora no lo ve nadie: se muestra con una suscripción paga y tu nombre visible (no con tu alias).</p>
      ) : null}

      <div className="flex items-center gap-4 rounded-control border border-app bg-surface-2 p-4">
        <Avatar userId={userId} name={name} url={avatarUrl} size={64} proBadge={!locked} frame={frame} />
        <span className="min-w-0 truncate text-base font-semibold text-main" style={nameColorStyle({ frame, nameColor })}>
          {name}
        </span>
      </div>

      <div role="radiogroup" aria-label="Marco" className="flex flex-wrap gap-3">
        {PROFILE_FRAMES.map((id) => {
          const selected = !locked && frame === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={locked || saving}
              onClick={() => choose({ frame: id })}
              className={`${CHOICE_CLASS} ${selected ? "border-2 border-[var(--primary)] font-semibold" : "border-app"} ${locked ? "opacity-60" : "hover:bg-surface-2"}`}
            >
              <Avatar userId={userId} name={name} url={null} size={24} proBadge frame={id} />
              {FRAME_META[id].label}
            </button>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="Color del nombre" className="flex flex-wrap gap-3">
        {NAME_COLORS.map((id) => {
          const selected = !locked && nameColor === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={locked || saving}
              onClick={() => choose({ nameColor: id })}
              className={`${CHOICE_CLASS} ${selected ? "border-2 border-[var(--primary)] font-semibold" : "border-app"} ${locked ? "opacity-60" : "hover:bg-surface-2"}`}
            >
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded-full border border-app"
                style={{ backgroundColor: id === "default" ? "var(--ink)" : `var(--flair-name-${id})` }}
              />
              {NAME_COLOR_META[id].label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
