export type SubscriptionStatus = "pending" | "authorized" | "paused" | "cancelled";

export interface SubscriptionDto {
  /** Same value as `MeDto.subscriptionsEnabled`. */
  enabled: boolean;
  priceArs: number;
  /** `null` = no row or unknown MP status. */
  status: SubscriptionStatus | null;
  /** ISO time, from MP `next_payment_date`. */
  currentPeriodEnd: string | null;
}

export interface SubscriptionCheckoutDto {
  initPoint: string;
}
