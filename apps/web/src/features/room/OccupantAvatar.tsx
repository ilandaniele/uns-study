import type { SeatAvatarDto } from "@uns/contracts";
import type { CSSProperties } from "react";
import { AVATAR_BACKDROP, SILHOUETTE_BODY, SILHOUETTE_HEAD, seatAvatarRender } from "./seat-avatar";

/** Round HTML avatar for an occupant descriptor (photo, alias animal or silhouette) — SeatDetail / nearby list. */
export function OccupantAvatar({ avatar, size = 32, className = "", style: extraStyle }: { avatar: SeatAvatarDto; size?: number; className?: string; style?: CSSProperties }) {
  const render = seatAvatarRender(avatar, true);
  const style = { width: size, height: size, ...extraStyle };
  if (render?.type === "photo") {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external HTTPS URLs, not a build-time asset
    return <img src={render.url} alt="" className={`shrink-0 rounded-full border-2 border-app object-cover ${className}`} style={style} />;
  }
  if (render?.type === "animal") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small static illustration copied into /public
      <img src={render.src} alt="" className={`shrink-0 rounded-full border-2 border-app p-[12%] ${className}`} style={{ ...style, backgroundColor: AVATAR_BACKDROP }} />
    );
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={`shrink-0 rounded-full border-2 border-app ${className}`} style={style}>
      <rect width={100} height={100} fill={AVATAR_BACKDROP} />
      <circle {...SILHOUETTE_HEAD} fill="white" />
      <path d={SILHOUETTE_BODY} fill="white" />
    </svg>
  );
}
