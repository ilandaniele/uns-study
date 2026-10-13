"use client";

import type { CheckInDto } from "@sala/contracts";
import { useEffect } from "react";
import { useNow } from "@/lib/use-now";
import { ExtendBanner } from "./ExtendBanner";
import { MyCheckInBar } from "./MyCheckInBar";
import { checkInExpiryStatus } from "./format";
import { isExpiringAlertFor } from "./expiring-alert";
import { useCheckInExpiring } from "./useCheckInExpiring";

export interface ActiveCheckInBannerProps {
  activeCheckIn: CheckInDto;
  seatLabel: string;
  pending: boolean;
  onShow: () => void;
  onExtend: () => void;
  onCheckOut: () => void;
  refetch: () => void;
  locating?: boolean;
}

/**
 * Owns the 30 s clock for the caller's check-in: "¿Seguís acá?" when 5 minutes or less remain (or the server sent `checkin:expiring`),
 * otherwise the always-visible "Tenés marcado" bar. Ticking here (not in the page) keeps the map
 * from re-rendering every 30 s.
 */
export function ActiveCheckInBanner({ activeCheckIn, seatLabel, pending, onShow, onExtend, onCheckOut, refetch, locating }: ActiveCheckInBannerProps) {
  const now = useNow(30_000);
  const expiryStatus = checkInExpiryStatus(activeCheckIn.expiresAt, now);
  const locallyExpired = !expiryStatus;
  // The server's 10-minute heads-up promotes the banner early (only while it still matches this check-in).
  const expiringAlert = isExpiringAlertFor(useCheckInExpiring(), activeCheckIn);

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

  if (expiryStatus && (expiryStatus.shouldPromptExtend || expiringAlert)) {
    return (
      <div className="order-0 sticky top-[57px] z-50 lg:static lg:z-auto lg:col-span-full">
        <ExtendBanner minutesLeft={expiryStatus.minutesLeft} pending={pending} onExtend={onExtend} onCheckOut={onCheckOut} locating={locating} />
      </div>
    );
  }
  return (
    <div className="order-0 lg:col-span-full">
      <MyCheckInBar seatLabel={seatLabel} expiresAt={activeCheckIn.expiresAt} pending={pending} onShow={onShow} onRelease={onCheckOut} />
    </div>
  );
}
