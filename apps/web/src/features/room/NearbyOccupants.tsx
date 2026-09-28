"use client";

import type { SeatOccupantDto } from "@uns/contracts";
import Link from "next/link";

/** "Personas cercanas" — avatars of other identified occupants at the same table, shown in `SeatDetail`. */
export function NearbyOccupants({ occupants }: { occupants: SeatOccupantDto[] }) {
  if (occupants.length === 0) return null;

  return (
    <div className="border-t border-app pt-3">
      <h2 className="text-sm font-semibold text-main">Personas cercanas</h2>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex -space-x-2">
          {occupants.slice(0, 5).map((occupant) => (
            <Link key={occupant.userId} href={`/u/${occupant.userId}`} title={occupant.displayName}>
              <OccupantAvatar occupant={occupant} />
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">
          {occupants.length} {occupants.length === 1 ? "persona en esta mesa" : "personas en esta mesa"}
        </p>
      </div>
      <Link href="/personas" className="mt-1.5 inline-block text-xs font-semibold text-primary hover:underline">
        Ver perfiles →
      </Link>
    </div>
  );
}

function OccupantAvatar({ occupant }: { occupant: SeatOccupantDto }) {
  if (occupant.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external HTTPS URLs, not a build-time asset
    return <img src={occupant.avatarUrl} alt="" className="h-8 w-8 rounded-full border-2 border-app object-cover" />;
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-app bg-[var(--surface-2)] text-xs font-semibold text-main">
      {occupant.displayName.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
