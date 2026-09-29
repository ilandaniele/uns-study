import { isAnimalId } from "@uns/contracts";
import { OccupantAvatar } from "@/features/room/OccupantAvatar";

/**
 * Solid, saturated colors that keep white initials legible in both light and dark themes —
 * deliberately independent of the app's theme tokens since an avatar's color is an identity
 * cue, not a UI surface. Kept in sync with `features/chat/Avatar.tsx` so the same user gets the
 * same color everywhere; duplicated rather than imported to keep this feature self-contained.
 */
const AVATAR_PALETTE = [
  "#2563EB", // blue
  "#7C3AED", // violet
  "#DB2777", // pink
  "#DC2626", // red
  "#EA580C", // orange
  "#059669", // green
  "#0891B2", // cyan
  "#4F46E5", // indigo
] as const;

/** Deterministic (same userId always maps to the same color) small-palette hash. */
export function avatarColorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

export interface AvatarProps {
  userId: string;
  name: string;
  url: string | null;
  /** Alias animal id of a hidden user; drawn instead of the initial when there is no photo. */
  aliasAnimal?: string | null;
  size: number;
  /** Optional colored ring (e.g. a podium medal color); omitted for plain list rows. */
  ringColor?: string;
}

/** Round avatar: the user's photo when set, otherwise their initial on a deterministic color. */
export function Avatar({ userId, name, url, aliasAnimal = null, size, ringColor }: AvatarProps) {
  const ringStyle = ringColor ? { boxShadow: `0 0 0 3px ${ringColor}` } : undefined;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small avatar thumbnails, may be same-origin relative URLs
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, ...ringStyle }}
      />
    );
  }
  if (isAnimalId(aliasAnimal)) return <OccupantAvatar avatar={{ kind: "animal", animalId: aliasAnimal }} size={size} style={ringStyle} />;
  const initial = name.slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, backgroundColor: avatarColorFor(userId), ...ringStyle }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
