import type { LocationInput } from "@sala/contracts";

/** One short sampling window, cancelled on hide, logout or seat change. Nothing is cached. */
export function watchStudyLocation(onFix: (location: LocationInput) => void, onUnavailable: () => void): () => void {
  if (!navigator.geolocation) { onUnavailable(); return () => undefined; }
  let done = false;
  const watch: { id?: number } = {};
  const finish = () => { done = true; if (watch.id !== undefined) navigator.geolocation.clearWatch(watch.id); clearTimeout(timeout); };
  const timeout = setTimeout(() => { if (!done) { finish(); onUnavailable(); } }, 15_000);
  watch.id = navigator.geolocation.watchPosition(position => {
    if (done) return;
    const now = Date.now();
    if (position.timestamp > now + 5_000 || now - position.timestamp > 45_000) return;
    finish();
    onFix({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString(), sentAt: new Date(now).toISOString() });
  }, () => { if (!done) { finish(); onUnavailable(); } }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  if (done) navigator.geolocation.clearWatch(watch.id);
  return finish;
}
