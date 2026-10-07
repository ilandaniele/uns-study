import { z } from "zod";

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

/** One-time donation amounts (ARS) offered as quick buttons. */
export const DONATION_AMOUNTS_ARS = [1000, 2000, 5000, 10000] as const;

/** Bounds for a custom amount (whole pesos). */
export const DONATION_MIN_ARS = 100;
export const DONATION_MAX_ARS = 1_000_000;

export const donationCheckoutSchema = z.object({
  amount: z.number().int().min(DONATION_MIN_ARS).max(DONATION_MAX_ARS),
});

export interface DonationCheckoutDto {
  initPoint: string;
}
