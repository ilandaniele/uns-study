import type { Role } from "../users/roles.service.js";

/** Staff never see ads; everyone else needs an authorized subscription. */
export function isAdFree(input: { subscriptionStatus: string | null | undefined; roles: readonly Role[] }): boolean {
  return input.subscriptionStatus === "authorized" || input.roles.length > 0;
}
