import type { LocationInput } from "@sala/contracts";

export type GeolocationErrorCode = "PERMISSION_DENIED" | "TIMEOUT" | "UNAVAILABLE" | "COARSE";

export class GeolocationRequestError extends Error {
  code: GeolocationErrorCode;

  constructor(code: GeolocationErrorCode, message: string) {
    super(message);
    this.name = "GeolocationRequestError";
    this.code = code;
  }
}

/** Stop sampling as soon as a fix is at least this precise (meters). */
const GOOD_ENOUGH_ACCURACY_M = 35;
/** Longest time spent collecting fixes before settling for the best one, counted from the first fix. */
const SAMPLE_WINDOW_MS = 2_500;
/** Absolute cap on the whole call, counted from the moment it's invoked (includes the permission prompt). */
const OVERALL_TIMEOUT_MS = 20_000;
/** A fix "older" than the call by more than this is a cached reading, not a new sample. */
const CACHED_FIX_TOLERANCE_MS = 5_000;
/**
 * A cached fix is still usable as a fallback up to this age — below the server's 120 s freshness
 * limit. Stationary phones indoors (iOS especially) often never produce a new fix and only hand
 * back the cached one, so discarding it would leave nothing at all.
 */
const MAX_CACHED_FIX_AGE_MS = 100_000;
/** At or above this accuracy the device is clearly giving a coarse (network/cell) fix, not GPS. */
const COARSE_ACCURACY_M = 500;

/** One raw sample taken from `watchPosition`, with its device-clock timestamp. */
interface Sample {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

/**
 * Picks the best sample: the most precise *fresh* fix (taken after the call started), falling back
 * to the most precise cached fix that's still recent enough for the server to accept. A cached fix
 * must never beat a fresh one (e.g. an outdoor GPS fix from minutes ago), but it's better than no
 * fix at all. Exported for unit testing; kept pure (no timers, no globals) on purpose.
 */
export function pickBestFix(samples: Sample[], startedAt: number, now: number = startedAt): Sample | null {
  let bestFresh: Sample | null = null;
  let bestCached: Sample | null = null;
  for (const sample of samples) {
    if (sample.timestamp >= startedAt - CACHED_FIX_TOLERANCE_MS) {
      if (!bestFresh || sample.accuracy < bestFresh.accuracy) bestFresh = sample;
    } else if (now - sample.timestamp <= MAX_CACHED_FIX_AGE_MS) {
      if (!bestCached || sample.accuracy < bestCached.accuracy) bestCached = sample;
    }
  }
  return bestFresh ?? bestCached;
}

/**
 * Requests a fresh (non-cached) device location for presence validation.
 *
 * Indoors the first fix is often a coarse Wi-Fi/cell estimate (80-150 m). Instead of taking it,
 * this watches the position for up to {@link SAMPLE_WINDOW_MS} — starting from the first fix, so
 * the time spent waiting on the browser's permission prompt never eats into the sampling window —
 * and keeps the most precise reading, returning early once one is good enough. Requests no
 * cached position (`maximumAge: 0`), but some stationary phones still supply one. Prefer fresh
 * samples; preserve a recent cached fallback's original timestamp so the server checks its age.
 */
function sampleLocation(options: { precise?: boolean } = {}): Promise<LocationInput> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeolocationRequestError("UNAVAILABLE", "La geolocalización no está disponible en este dispositivo."));
      return;
    }

    const samples: Sample[] = [];
    let settled = false;
    let watchId: number | null = null;
    // Device-clock time of the call: fixes older than this (minus a tolerance) are cached ones.
    const calledAt = Date.now();
    let firstFixAt: number | null = null;
    let windowTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (windowTimer !== null) clearTimeout(windowTimer);
      clearTimeout(overallTimer);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimers();
      // Stationary phones may supply only a recent OS-cached fix. Preserve its original timestamp:
      // the server may use it for room presence + MANUAL confirmation, never automatic seating.
      const best = pickBestFix(samples, calledAt, Date.now());
      if (best) {
        if (best.accuracy >= COARSE_ACCURACY_M) {
          reject(
            new GeolocationRequestError(
              "COARSE",
              "Tu ubicación es muy poco precisa. Activá la ubicación exacta/precisa del dispositivo y probá de nuevo.",
            ),
          );
          return;
        }
        resolve({
          latitude: best.latitude,
          longitude: best.longitude,
          accuracy: best.accuracy,
          capturedAt: new Date(best.timestamp).toISOString(),
          // Sent alongside so the server can measure the fix's age on this device's clock.
          sentAt: new Date().toISOString(),
        });
      } else {
        reject(new GeolocationRequestError("TIMEOUT", "No pudimos obtener tu ubicación a tiempo."));
      }
    };

    const fail = (error: GeolocationRequestError) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimers();
      reject(error);
    };

    // Absolute cap from call time — covers a permission prompt the visitor never answers.
    const overallTimer = setTimeout(() => finish(), OVERALL_TIMEOUT_MS);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (settled) return;
        if (firstFixAt === null) {
          // Sampling starts on the FIRST successful fix, not at call time — the
          // permission prompt's duration must not eat into it.
          firstFixAt = Date.now();
          windowTimer = setTimeout(() => finish(), options.precise ? 6_000 : SAMPLE_WINDOW_MS);
        }
        samples.push({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        // Stop early only on a precise *fresh* fix; a precise cached one keeps sampling for a newer read.
        if (position.coords.accuracy <= (options.precise ? 0.25 : GOOD_ENOUGH_ACCURACY_M) && position.timestamp >= calledAt - CACHED_FIX_TOLERANCE_MS) finish();
      },
      (error) => {
        if (settled) return;
        if (error.code === error.PERMISSION_DENIED) {
          // Bare message here — `describeActionError` (lib/errors.ts) appends the platform-specific
          // "cómo reactivarlo" copy, since it's the one that knows about the visitor's user agent.
          fail(new GeolocationRequestError("PERMISSION_DENIED", "Permiso de ubicación denegado."));
          return;
        }
        if (samples.length) {
          finish();
          return;
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          // No fix at all and the device itself reports it can't locate — this is what browsers
          // surface when location services are turned off system-wide, not a transient blip.
          fail(new GeolocationRequestError("UNAVAILABLE", "Tu dispositivo tiene la ubicación apagada. Activala y probá de nuevo."));
          return;
        }
        // Transient per-attempt TIMEOUT with no fix yet: watchPosition keeps retrying on its own
        // until the sampling/overall window ends.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
    );
  });
}

/** Seat attempts bypass the shared cache; an OS-cached fallback keeps its original timestamp. */
export function getSeatLocation(precise = true): Promise<LocationInput> {
  return sampleLocation({ precise });
}

/** A recent, precise-enough fix is reused for this long instead of sampling the GPS again. */
const REUSE_FIX_MS = 45_000;
/** Only fixes at least this precise are worth reusing (the server tolerates up to 150 m). */
const REUSE_MAX_ACCURACY_M = 80;

let lastFix: LocationInput | null = null;
let inFlight: Promise<LocationInput> | null = null;

/** Pure check (exported for tests): is a cached fix still fresh and precise enough to reuse now? */
export function isReusableFix(fix: LocationInput | null, now: number): fix is LocationInput {
  if (!fix) return false;
  const age = now - Date.parse(fix.capturedAt);
  return age >= 0 && age <= REUSE_FIX_MS && fix.accuracy <= REUSE_MAX_ACCURACY_M;
}

function sampleOnce(): Promise<LocationInput> {
  if (!inFlight) {
    inFlight = sampleLocation()
      .then((fix) => {
        lastFix = fix;
        return fix;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Device location for presence-checked actions. Reuses a fix from the last {@link REUSE_FIX_MS}
 * when it's precise enough, so consecutive actions (and actions right after {@link primeLocation})
 * answer instantly instead of waiting on the GPS each time; otherwise samples (deduped, so two
 * taps never start two GPS sessions).
 */
export function getFreshLocation(): Promise<LocationInput> {
  if (isReusableFix(lastFix, Date.now())) {
    return Promise.resolve({ ...lastFix, sentAt: new Date().toISOString() });
  }
  return sampleOnce();
}

/**
 * Starts sampling in the background (e.g. when a seat is tapped) so the fix is usually ready by the
 * time the person presses "Estoy acá". Only runs when location permission is already granted —
 * it must never trigger the browser's permission prompt on its own.
 */
export function primeLocation(): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (isReusableFix(lastFix, Date.now()) || inFlight) return;
  const permissions = navigator.permissions;
  if (!permissions?.query) return;
  void permissions
    .query({ name: "geolocation" as PermissionName })
    .then((status) => {
      if (status.state === "granted") void sampleOnce().catch(() => undefined);
    })
    .catch(() => undefined);
}
