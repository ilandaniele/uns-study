import type { ProfileFrameId } from "@sala/contracts";

/** Ring color for Pro subscribers; the primary token so it follows the active palette and theme. */
export const PRO_RING_COLOR = "var(--primary)";

/** Pro "Perfil destacado" frame layers; `n` shifts each spread outwards when a medal ring sits inside. */
function frameLayers(frame: Exclude<ProfileFrameId, "none">, n: (px: number) => number): string {
  switch (frame) {
    case "gold":
      return `0 0 0 ${n(2)}px var(--surface), 0 0 0 ${n(4)}px var(--flair-frame-gold)`;
    case "double":
      return `0 0 0 ${n(2)}px var(--surface), 0 0 0 ${n(4)}px ${PRO_RING_COLOR}, 0 0 0 ${n(6)}px var(--surface), 0 0 0 ${n(8)}px ${PRO_RING_COLOR}`;
    case "glow":
      return `0 0 0 ${n(2)}px var(--surface), 0 0 0 ${n(4)}px ${PRO_RING_COLOR}, 0 0 12px ${n(4)}px color-mix(in srgb, ${PRO_RING_COLOR} 45%, transparent)`;
    case "duo":
      return `0 0 0 ${n(2)}px var(--flair-frame-duo-a), 0 0 0 ${n(4)}px var(--flair-frame-duo-b)`;
  }
}

/**
 * `box-shadow` for an avatar ring: a podium medal color, a Pro ring, both (medal inside, Pro outside),
 * or nothing. Pro gets a surface-colored gap so the ring reads as separate from the photo.
 * A Pro `frame` replaces the plain Pro ring; it is ignored without `proBadge`.
 */
export function avatarRingShadow(opts: { ringColor?: string; proBadge?: boolean; frame?: ProfileFrameId }): string | undefined {
  const { ringColor, proBadge, frame } = opts;
  if (proBadge && frame && frame !== "none") {
    if (ringColor) return `0 0 0 3px ${ringColor}, ${frameLayers(frame, (px) => px + 1)}`;
    return frameLayers(frame, (px) => px);
  }
  if (proBadge && ringColor) return `0 0 0 3px ${ringColor}, 0 0 0 5px ${PRO_RING_COLOR}`;
  if (proBadge) return `0 0 0 2px var(--surface), 0 0 0 4px ${PRO_RING_COLOR}`;
  if (ringColor) return `0 0 0 3px ${ringColor}`;
  return undefined;
}
