import type { NameColorId, ProfileFlairDto, ProfileFrameId } from "@sala/contracts";
import type { CSSProperties } from "react";

export const FRAME_META: Record<ProfileFrameId, { label: string }> = {
  none: { label: "Clásico" },
  gold: { label: "Dorado" },
  double: { label: "Doble" },
  glow: { label: "Brillo" },
  duo: { label: "Dúo" },
};

export const NAME_COLOR_META: Record<NameColorId, { label: string }> = {
  default: { label: "Normal" },
  ocean: { label: "Océano" },
  forest: { label: "Bosque" },
  berry: { label: "Frambuesa" },
  sunset: { label: "Atardecer" },
  violet: { label: "Violeta" },
  gold: { label: "Oro" },
};

/** Inline style for a display name; undefined (keep the normal text color) for default or absent flair. */
export function nameColorStyle(flair: ProfileFlairDto | null | undefined): CSSProperties | undefined {
  if (!flair || flair.nameColor === "default") return undefined;
  return { color: `var(--flair-name-${flair.nameColor})` };
}

export function frameOf(flair: ProfileFlairDto | null | undefined): ProfileFrameId | undefined {
  return flair?.frame;
}
