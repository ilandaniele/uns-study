"use client";

import type { CheckInDto } from "@uns/contracts";
import { useEffect } from "react";
import { useNow } from "@/lib/use-now";
import { ExtendBanner } from "./ExtendBanner";
import { MyCheckInBar } from "./MyCheckInBar";
import { checkInExpiryStatus } from "./format";

export interface ActiveCheckInBannerProps {
  activeCheckIn: CheckInDto;
  seatLabel: string;
  pending: boolean;
  onShow: () => void;
  onExtend: () => void;
  onCheckOut: () => void;
  refetch: () => void;
}

/**
 * Owns the 30 s clock for the caller's check-in: "¿Seguís acá?" when 5 minutes or less remain,
 * otherwise the always-visible "Tenés marcado" bar. Ticking here (not in the page) keeps the map
 * from re-rendering every 30 s.
 */
export function ActiveCheckInBanner({ activeCheckIn, seatLabel, pending, onShow, onExtend, onCheckOut, refetch }: ActiveCheckInBannerProps) {
  const now = useNow(30_000);
  const expiryStatus = checkInExpiryStatus(activeCheckIn.expiresAt, now);
  const locallyExpired = !expiryStatus;

  // The active check-in expired locally (expiresAt passed); refetch /me so MY_SEAT clears once the
  // server has processed the expiration too. Keyed on id+expiresAt (primitives, stable across
  // refetches) and the `locallyExpired` boolean rather than the objects, so a refetch that comes
  // back with the *same* still-expired check-in can't re-trigger this effect and poll forever on
  // every render — one shot after 5s, then at most every 15s, until the check-in itself changes.
  const activeCheckInKey = `${activeCheckIn.id}:${activeCheckIn.expiresAt}`;
  useEffect(() => {
    if (!locallyExpired) return;
    const initial = setTimeout(() => refetch(), 5_000);
    const poll = setInterval(() => refetch(), 15_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }, [activeCheckInKey, locallyExpired, refetch]);

  if (expiryStatus?.shouldPromptExtend) {
    return (
      <div className="order-0 sticky top-0 z-50 lg:static lg:z-auto lg:col-span-3">
        <ExtendBanner minutesLeft={expiryStatus.minutesLeft} pending={pending} onExtend={onExtend} onCheckOut={onCheckOut} />
      </div>
    );
  }
  return (
    <div className="order-0 lg:col-span-3">
      <MyCheckInBar seatLabel={seatLabel} expiresAt={activeCheckIn.expiresAt} pending={pending} onShow={onShow} onRelease={onCheckOut} />
    </div>
  );
}
