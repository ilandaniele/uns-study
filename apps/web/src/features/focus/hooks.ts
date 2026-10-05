import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { primeAudio } from "./focus-audio";
import { focusActions } from "./focus-store";

export const noopSubscribe = () => () => {};
/** False during SSR and hydration, true after: gates anything that depends on the local clock or browser APIs. */
export function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

interface PipApi {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

function getPipApi(): PipApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ?? null;
}

export function usePipWindow() {
  const [win, setWin] = useState<Window | null>(null);
  const mounted = useMounted();
  const supported = mounted && getPipApi() !== null;

  const open = useCallback(async () => {
    const api = getPipApi();
    if (!api) return;
    if (api.window) {
      api.window.close();
      return;
    }
    const pip = await api.requestWindow({ width: 300, height: 220 });
    // Same styles and theme as the app.
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
      pip.document.head.appendChild(node.cloneNode(true));
    }
    pip.document.documentElement.className = document.documentElement.className;
    pip.document.title = "Foco";
    pip.document.body.className = "bg-app text-main antialiased";
    pip.addEventListener("pagehide", () => setWin(null), { once: true });
    setWin(pip);
  }, []);

  // Keep the theme in sync if the user flips it while the mini window is open.
  useEffect(() => {
    if (!win) return;
    const obs = new MutationObserver(() => {
      win.document.documentElement.className = document.documentElement.className;
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [win]);

  return { supported, win, open };
}

// ---------- Fullscreen + shortcuts ----------

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  const mounted = useMounted();
  const supported = mounted && typeof document !== "undefined" && !!document.fullscreenEnabled;
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement === ref.current && ref.current !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [ref]);
  const toggle = useCallback(() => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen().catch(() => {});
  }, [ref]);
  return { supported, on, toggle };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function useShortcuts(toggleFullscreen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === " " || e.code === "Space") {
        // A focused button already reacts to Space on its own.
        if (e.target instanceof HTMLElement && e.target.closest("button, a, [role='switch'], [role='checkbox']")) return;
        e.preventDefault();
        primeAudio();
        focusActions.toggle();
      } else if (key === "r") focusActions.resetPhase();
      else if (key === "s") focusActions.skip();
      else if (key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);
}
