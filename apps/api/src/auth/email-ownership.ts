import { env } from "../env.js";

/** All deployed environments require proof. Local/E2E runs need no email service. */
export function hasEmailOwnership(user: { emailVerified?: boolean } | null | undefined): boolean {
  return Boolean(user && (!env.isProduction || user.emailVerified === true));
}
