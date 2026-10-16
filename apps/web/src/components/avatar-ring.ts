/** Ring color for Pro subscribers; the primary token so it follows the active palette and theme. */
export const PRO_RING_COLOR = "var(--primary)";

/**
 * `box-shadow` for an avatar ring: a podium medal color, a Pro ring, both (medal inside, Pro outside),
 * or nothing. Pro gets a surface-colored gap so the ring reads as separate from the photo.
 */
export function avatarRingShadow(opts: { ringColor?: string; proBadge?: boolean }): string | undefined {
  const { ringColor, proBadge } = opts;
  if (proBadge && ringColor) return `0 0 0 3px ${ringColor}, 0 0 0 5px ${PRO_RING_COLOR}`;
  if (proBadge) return `0 0 0 2px var(--surface), 0 0 0 4px ${PRO_RING_COLOR}`;
  if (ringColor) return `0 0 0 3px ${ringColor}`;
  return undefined;
}
