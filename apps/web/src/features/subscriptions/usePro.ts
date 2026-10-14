"use client";

import { useMe } from "@/lib/me-store";
import { proLockState, type ProLock } from "./pro";

const DEFAULT_PRICE_ARS = 1500;

export function usePro(): { lock: ProLock; priceArs: number } {
  const { me, loading } = useMe();
  return { lock: proLockState(me, loading), priceArs: me?.subscriptionPriceArs ?? DEFAULT_PRICE_ARS };
}
