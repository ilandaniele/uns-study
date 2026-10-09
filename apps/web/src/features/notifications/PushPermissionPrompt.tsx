"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { enablePushNotificationsDetailed, getPushSupportState, pushFailureMessage } from "@/lib/push";
import { isPromptRoute, readSnooze, shouldShowPushPrompt, SNOOZE_FAILED_MS, SNOOZE_LATER_MS, writeSnooze } from "./push-prompt";

const SHOW_DELAY_MS = 4000;
const MESSAGE_MS = 5000;

const POSITION =
  "fixed inset-x-3 bottom-[calc(140px+env(safe-area-inset-bottom))] z-40 sm:left-auto sm:right-4 sm:w-[360px] lg:right-6 lg:bottom-[92px]";

/** App-wide, one-tap offer to turn on push. Appears a few seconds after load, only for signed-in
 *  users on a device where push is possible, undecided, and not already subscribed. */
export function PushPermissionPrompt() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const signedIn = Boolean(session?.user);
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || getPushSupportState() !== "available") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => {
          if (cancelled) return;
          setEligible(
            shouldShowPushPrompt({
              signedIn,
              support: getPushSupportState(),
              permission: Notification.permission,
              hasSubscription: subscription !== null,
              snoozedUntil: readSnooze(),
              now: Date.now(),
              pathname: "/",
            }),
          );
        })
        .catch(() => {});
    }, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signedIn]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  const showDialog = eligible && signedIn && isPromptRoute(pathname) && !message;

  function snooze(durationMs: number) {
    writeSnooze(durationMs);
    setEligible(false);
  }

  useEffect(() => {
    if (!showDialog || busy) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") snooze(SNOOZE_LATER_MS);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDialog, busy]);

  // Called straight from the click so the browser allows the permission prompt.
  async function handleEnable() {
    setBusy(true);
    try {
      const result = await enablePushNotificationsDetailed();
      if (result.ok) {
        setEligible(false);
        setMessage("Listo, notificaciones activadas.");
      } else {
        snooze(SNOOZE_FAILED_MS);
        setMessage(`${pushFailureMessage(result)} También podés activarlas desde tu perfil.`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (message) {
    return (
      <p role="status" className={`${POSITION} rounded-[12px] border border-app bg-surface px-4 py-3 text-sm text-main shadow-lg`}>
        {message}
      </p>
    );
  }
  if (!showDialog) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="push-prompt-title"
      aria-describedby="push-prompt-body"
      className={`${POSITION} flex flex-col gap-3 rounded-[12px] border border-app bg-surface p-4 shadow-lg`}
    >
      <div className="flex flex-col gap-1">
        <h2 id="push-prompt-title" className="text-sm font-semibold text-main">¿Activamos las notificaciones?</h2>
        <p id="push-prompt-body" className="text-xs text-muted">
          Te avisamos si te escriben por privado, si alguien reclama tu lugar o si se libera un asiento.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleEnable()}
          disabled={busy}
          className="rounded-lg bg-primary min-h-11 px-3.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 lg:min-h-9 lg:text-xs"
        >
          {busy ? "Activando…" : "Activar"}
        </button>
        <button
          type="button"
          onClick={() => snooze(SNOOZE_LATER_MS)}
          disabled={busy}
          className="rounded-lg border border-app bg-surface min-h-11 px-3.5 text-sm font-semibold text-main hover:bg-[var(--surface-2)] disabled:opacity-50 lg:min-h-9 lg:text-xs"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
