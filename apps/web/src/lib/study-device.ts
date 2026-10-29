let fallback: string | undefined;
/** Random browser identifier, used only to keep other signed-in devices from contradicting GPS. */
export function getStudyDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem("sala:study-device:v1");
    if (existing) return existing;
    const id = crypto.randomUUID(); window.localStorage.setItem("sala:study-device:v1", id); return id;
  } catch { return fallback ??= crypto.randomUUID(); }
}
