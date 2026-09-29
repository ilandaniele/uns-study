"use client";

import type { SeatOccupantDto } from "@uns/contracts";
import Link from "next/link";
import { OccupantAvatar } from "./OccupantAvatar";

/** "Personas cercanas" — avatars of other identified occupants at the same table, shown in `SeatDetail`. */
export function NearbyOccupants({ occupants }: { occupants: SeatOccupantDto[] }) {
  if (occupants.length === 0) return null;

  return (
    <div className="border-t border-app pt-3">
      <h2 className="text-sm font-semibold text-main">Personas cercanas</h2>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex -space-x-2">
          {occupants.slice(0, 5).map((occupant) => {
            const avatar = <OccupantAvatar avatar={occupant.avatar} />;
            return occupant.userId ? (
              <Link key={occupant.seatId} href={`/u/${occupant.userId}`} title={occupant.displayName}>
                {avatar}
              </Link>
            ) : (
              <span key={occupant.seatId} title={occupant.displayName}>
                {avatar}
              </span>
            );
          })}
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
