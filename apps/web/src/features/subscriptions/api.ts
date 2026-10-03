import type { SubscriptionCheckoutDto, SubscriptionDto } from "@sala/contracts";
import { apiFetch, apiPost } from "@/lib/api";

export function fetchSubscription(): Promise<SubscriptionDto> {
  return apiFetch<SubscriptionDto>("/api/v1/subscriptions/me");
}

export function startCheckout(): Promise<SubscriptionCheckoutDto> {
  return apiPost<SubscriptionCheckoutDto>("/api/v1/subscriptions/checkout");
}

export function cancelSubscription(): Promise<SubscriptionDto> {
  return apiPost<SubscriptionDto>("/api/v1/subscriptions/cancel");
}
