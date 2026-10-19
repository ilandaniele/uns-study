import { animalAvatarPath, animalBackdrop, isAnimalId, type SeatAvatarDto } from "@sala/contracts";

/** Light blue-grey backdrop of the silhouette; animals get their own colour (`animalBackdrop`). */
export const AVATAR_BACKDROP = "#c5d0e6";

/** Generic head-and-shoulders silhouette, drawn white on `AVATAR_BACKDROP` in a 100x100 box. */
export const SILHOUETTE_HEAD = { cx: 50, cy: 38, r: 17 } as const;
export const SILHOUETTE_BODY = "M18 100 C18 74 32 62 50 62 C68 62 82 74 82 100 Z";

export type SeatAvatarRender =
  | { type: "photo"; url: string }
  | { type: "animal"; src: string; backdrop: string }
  | { type: "silhouette" };

/**
 * Decides what badge an occupied seat gets. `null` keeps the plain status glyph (seat isn't occupied,
 * or we know nothing about who sits there). Unknown animal ids and empty photo URLs degrade to a silhouette.
 */
export function seatAvatarRender(avatar: SeatAvatarDto | null | undefined, seatOccupied: boolean): SeatAvatarRender | null {
  if (!seatOccupied || !avatar) return null;
  if (avatar.kind === "photo") return avatar.url ? { type: "photo", url: avatar.url } : { type: "silhouette" };
  if (avatar.kind === "animal") return isAnimalId(avatar.animalId) ? { type: "animal", src: animalAvatarPath(avatar.animalId), backdrop: animalBackdrop(avatar.animalId) } : { type: "silhouette" };
  return { type: "silhouette" };
}

/** "Marcado por: Ana · hace 5 min" — shown for seats that are OCCUPIED only because someone marked them. */
export function markedByLabel(name: string, observedAt: string, now: Date = new Date(), kind: "OCCUPIED" | "SAVED" = "OCCUPIED"): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(observedAt).getTime()) / 60_000));
  const ago = minutes < 1 ? "hace instantes" : minutes < 60 ? `hace ${minutes} min` : `hace ${Math.floor(minutes / 60)} h`;
  return kind === "SAVED" ? `${name} avisó que este lugar lo guardaron · ${ago}` : `Marcado por: ${name} · ${ago}`;
}

export type OccupantAvatarProps =
  | { type: "photo"; src: string; style: { width: number; height: number } }
  | { type: "animal"; src: string; style: { width: number; height: number; padding: number; backgroundColor: string } }
  | { type: "silhouette"; style: { width: number; height: number } };

/**
 * Maps a descriptor to the element props of the round HTML avatar. The animal padding is in px (12% of `size`):
 * a percentage padding resolves against the *container* width, which swallowed the whole image in flex rows.
 */
export function occupantAvatarProps(avatar: SeatAvatarDto, size: number): OccupantAvatarProps {
  const box = { width: size, height: size };
  const render = seatAvatarRender(avatar, true);
  if (render?.type === "photo") return { type: "photo", src: render.url, style: box };
  if (render?.type === "animal") return { type: "animal", src: render.src, style: { ...box, padding: Math.round(size * 0.12), backgroundColor: render.backdrop } };
  return { type: "silhouette", style: box };
}
