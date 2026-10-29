import type { LocationInput } from "@sala/contracts";
import { getSeatLocation, isReusableFix } from "@/lib/geolocation";

/** Only a manual confirmation of this same attempt may reuse its recent room-presence fix. */
export function simpleActionLocation(previous: LocationInput | null, confirmed: boolean): Promise<LocationInput> {
  if (confirmed && previous && isReusableFix(previous, Date.now())) return Promise.resolve({ ...previous, sentAt: new Date().toISOString() });
  return getSeatLocation(!confirmed);
}
