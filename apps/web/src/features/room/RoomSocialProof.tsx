"use client";

import Link from "next/link";
import type { SeatDto } from "@sala/contracts";
import { useNow } from "@/lib/use-now";
import { contributionsTodayLabel, latestSeatUpdateMs, updatedAgoLabel, visitorsTodayLabel } from "./room-social";

/** "· Actualizado hace 2 min", next to the "En vivo" line. Owns its 30 s tick so the page doesn't re-render. */
export function UpdatedAgo({ seats }: { seats: Pick<SeatDto, "status" | "sourceSummary" | "lastUpdatedAt">[] }) {
  const now = useNow(30_000);
  const label = updatedAgoLabel(latestSeatUpdateMs(seats), now);
  return label ? <span>· {label}</span> : null;
}

/** Small muted social-proof lines: visitors today and the user's own contributions, with a link to the ranking. */
export function RoomSocialProof({ visitorsToday, myContributionsToday }: { visitorsToday: number | null; myContributionsToday: number | null }) {
  const visitors = visitorsTodayLabel(visitorsToday);
  const contributions = contributionsTodayLabel(myContributionsToday);
  if (!visitors && !contributions) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {contributions ? (
        <p className="flex flex-wrap items-center gap-x-2 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-xs text-main">
          <span>{contributions}</span>
          <Link href="/ranking" className="font-semibold text-primary underline-offset-2 hover:underline">
            Ver ranking
          </Link>
        </p>
      ) : null}
      {visitors ? <p className="text-xs text-muted">{visitors}</p> : null}
    </div>
  );
}
