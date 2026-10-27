import type { AdminBadgeLevel, ProfileFrameId, SeatAvatarDto } from "@sala/contracts";
import type { CSSProperties } from "react";
import { WithAdminBadge } from "@/components/AdminBadge";
import { avatarRingShadow } from "@/components/avatar-ring";
import { AVATAR_BACKDROP, SILHOUETTE_BODY, SILHOUETTE_HEAD, occupantAvatarProps } from "./seat-avatar";

/** Round HTML avatar for an occupant descriptor (photo, alias animal or silhouette) — SeatDetail / nearby list. */
export function OccupantAvatar({
  adminBadge = false,
  ...props
}: {
  avatar: SeatAvatarDto;
  size?: number;
  className?: string;
  style?: CSSProperties;
  adminBadge?: AdminBadgeLevel;
  /** Draws the Pro ring (paid subscription); `frame` only applies with it. */
  proBadge?: boolean;
  frame?: ProfileFrameId;
}) {
  return (
    <WithAdminBadge show={adminBadge} size={props.size ?? 32}>
      <OccupantAvatarImage {...props} />
    </WithAdminBadge>
  );
}

function OccupantAvatarImage({
  avatar,
  size = 32,
  className = "",
  style: passedStyle,
  proBadge,
  frame,
}: {
  avatar: SeatAvatarDto;
  size?: number;
  className?: string;
  style?: CSSProperties;
  proBadge?: boolean;
  frame?: ProfileFrameId;
}) {
  const props = occupantAvatarProps(avatar, size);
  const boxShadow = avatarRingShadow({ proBadge, frame });
  const extraStyle = boxShadow ? { ...passedStyle, boxShadow } : passedStyle;
  if (props.type === "photo") {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external HTTPS URLs, not a build-time asset
    return <img src={props.src} alt="" className={`shrink-0 rounded-full border-2 border-app object-cover ${className}`} style={{ ...props.style, ...extraStyle }} />;
  }
  if (props.type === "animal") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small static illustration copied into /public
      <img src={props.src} alt="" className={`box-border shrink-0 rounded-full border-2 border-app ${className}`} style={{ ...props.style, ...extraStyle }} />
    );
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={`shrink-0 rounded-full border-2 border-app ${className}`} style={{ ...props.style, ...extraStyle }}>
      <rect width={100} height={100} fill={AVATAR_BACKDROP} />
      <circle {...SILHOUETTE_HEAD} fill="white" />
      <path d={SILHOUETTE_BODY} fill="white" />
    </svg>
  );
}
