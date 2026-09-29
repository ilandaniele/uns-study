import { animalAvatarPath, isAnimalId, type SeatAvatarDto } from "@uns/contracts";

/** Light blue-grey backdrop shared by the silhouette and the animal illustrations. */
export const AVATAR_BACKDROP = "#c5d0e6";

/** Generic head-and-shoulders silhouette, drawn white on `AVATAR_BACKDROP` in a 100x100 box. */
export const SILHOUETTE_HEAD = { cx: 50, cy: 38, r: 17 } as const;
export const SILHOUETTE_BODY = "M18 100 C18 74 32 62 50 62 C68 62 82 74 82 100 Z";

export type SeatAvatarRender =
  | { type: "photo"; url: string }
  | { type: "animal"; src: string }
  | { type: "silhouette" };

/**
 * Decides what badge an occupied seat gets. `null` keeps the plain status glyph (seat isn't occupied,
 * or we know nothing about who sits there). Unknown animal ids and empty photo URLs degrade to a silhouette.
 */
export function seatAvatarRender(avatar: SeatAvatarDto | null | undefined, seatOccupied: boolean): SeatAvatarRender | null {
  if (!seatOccupied || !avatar) return null;
  if (avatar.kind === "photo") return avatar.url ? { type: "photo", url: avatar.url } : { type: "silhouette" };
  if (avatar.kind === "animal") return isAnimalId(avatar.animalId) ? { type: "animal", src: animalAvatarPath(avatar.animalId) } : { type: "silhouette" };
  return { type: "silhouette" };
}

/** "Marcado por: Ana · hace 5 min" — shown for seats that are OCCUPIED only because someone marked them. */
export function markedByLabel(name: string, observedAt: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(observedAt).getTime()) / 60_000));
  const ago = minutes < 1 ? "hace instantes" : minutes < 60 ? `hace ${minutes} min` : `hace ${Math.floor(minutes / 60)} h`;
  return `Marcado por: ${name} · ${ago}`;
}
