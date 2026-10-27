"use client";

import type { AdminBadgeLevel, ProfileFrameId, RoomPersonDto } from "@sala/contracts";
import { WithAdminBadge } from "@/components/AdminBadge";
import { avatarRingShadow } from "@/components/avatar-ring";
import { frameOf, nameColorStyle } from "@/components/flair";
import { seatCodeLabel } from "@/features/room/format";
import { OccupantAvatar } from "@/features/room/OccupantAvatar";
import Link from "next/link";

export interface PeopleListProps {
  people: RoomPersonDto[];
  /** Caps the number of rows rendered (used by the room-page preview panel); omit to show all. */
  limit?: number;
  emptyLabel?: string;
}

/** Reused by the `/sala/[slug]` "Personas en la sala" preview panel and the full `/personas` page. */
export function PeopleList({ people, limit, emptyLabel = "Nadie está mostrándose en la sala por ahora." }: PeopleListProps) {
  const visible = limit ? people.slice(0, limit) : people;

  if (visible.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-[var(--border)]">
      {visible.map((person) => (
        <li key={person.userId ?? `alias-${person.displayName}-${person.seatCode ?? ""}`} className="flex items-center gap-3 py-2.5">
          {person.userId ? (
            <Link href={`/u/${person.userId}`} aria-hidden="true" tabIndex={-1} className="shrink-0 rounded-full">
              {person.aliasAnimal ? (
                <OccupantAvatar avatar={{ kind: "animal", animalId: person.aliasAnimal }} size={40} adminBadge={person.adminBadge} />
              ) : (
                <PersonAvatar name={person.displayName} avatarUrl={person.avatarUrl} adminBadge={person.adminBadge} proBadge={person.proBadge} frame={frameOf(person.flair)} />
              )}
            </Link>
          ) : person.aliasAnimal ? (
            <OccupantAvatar avatar={{ kind: "animal", animalId: person.aliasAnimal }} size={40} adminBadge={person.adminBadge} />
          ) : (
            <PersonAvatar name={person.displayName} avatarUrl={person.avatarUrl} adminBadge={person.adminBadge} proBadge={person.proBadge} frame={frameOf(person.flair)} />
          )}
          <div className="min-w-0 flex-1">
            {person.userId ? (
              <Link href={`/u/${person.userId}`} className="block truncate text-sm font-medium text-main hover:text-primary" style={nameColorStyle(person.flair)}>
                {person.displayName}
              </Link>
            ) : (
              <span className="block truncate text-sm font-medium text-main" style={nameColorStyle(person.flair)}>
                {person.displayName}
              </span>
            )}
            <p className="truncate text-xs text-muted">
              {[person.career, person.seatCode ? seatCodeLabel(person.seatCode) : null, person.studyStatus?.subject].filter(Boolean).join(" · ") || "Estudiando"}
            </p>
          </div>
          {person.studyStatus?.lookingForGroup ? (
            <span className="shrink-0 rounded-control bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Busca grupo</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function PersonAvatar({
  name,
  avatarUrl,
  adminBadge = false,
  proBadge = false,
  frame,
}: {
  name: string;
  avatarUrl: string | null;
  adminBadge?: AdminBadgeLevel;
  proBadge?: boolean;
  frame?: ProfileFrameId;
}) {
  return (
    <WithAdminBadge show={adminBadge} size={36}>
      <PersonAvatarImage name={name} avatarUrl={avatarUrl} boxShadow={avatarRingShadow({ proBadge, frame })} />
    </WithAdminBadge>
  );
}

function PersonAvatarImage({ name, avatarUrl, boxShadow }: { name: string; avatarUrl: string | null; boxShadow?: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external HTTPS URLs, not a build-time asset
    return <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ boxShadow }} />;
  }
  return (
    <span style={{ boxShadow }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm font-semibold text-main">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
