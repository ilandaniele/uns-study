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

/** One-time donation amounts (ARS) offered as buttons; the API accepts only these. */
export const DONATION_AMOUNTS_ARS = [1000, 2000, 5000, 10000] as const;

export const donationCheckoutSchema = z.object({
  amount: z.number().int().refine((n) => (DONATION_AMOUNTS_ARS as readonly number[]).includes(n), "Monto no permitido"),
});

export interface DonationCheckoutDto {
  initPoint: string;
}
