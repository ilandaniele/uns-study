import { SetMetadata } from "@nestjs/common";

export const ALLOW_RESTRICTED_KEY = "uns:allow-restricted";

/** Marks a route that `AuthGuard` must keep reachable for SUSPENDED/BANNED accounts (e.g. account deletion). */
export const AllowRestricted = () => SetMetadata(ALLOW_RESTRICTED_KEY, true);
