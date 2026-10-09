"use client";

import { useState } from "react";
import { useNotificationPreferences } from "./useNotificationPreferences";
import {
  disablePushNotifications,
  enablePushNotificationsDetailed,
  getPushSupportState,
  isIos,
  isStandalone,
  pushFailureMessage,
} from "@/lib/push";

/** Toggle switch matching `PrivacyToggles`'s look. */
function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-app transition-colors before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[''] disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-[var(--surface-2)]"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** "Notificaciones" section for /perfil: the opt-in switches plus the "activate on this
 *  device" push flow (with iOS/unsupported/blocked messaging). */
export function NotificationSettings() {
  const { preferences, loading, saving, update } = useNotificationPreferences();
  const [deviceState, setDeviceState] = useState<"idle" | "enabling" | "enabled" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const support = getPushSupportState();
  const showIosHint = isIos() && !isStandalone();

  async function handleEnableDevice() {
    setDeviceState("enabling");
    setErrorMessage(null);
    const result = await enablePushNotificationsDetailed();
    if (result.ok) {
      setDeviceState("enabled");
    } else {
      setErrorMessage(pushFailureMessage(result));
      setDeviceState("error");
    }
  }

  async function handleDisableDevice() {
    await disablePushNotifications();
    setDeviceState("idle");
  }

  if (loading || !preferences) {
    return <p className="text-sm text-muted">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-[var(--border)]">
        <div className="flex items-start justify-between gap-4 py-3">
          <span>
            <span className="block text-sm font-medium text-main">Avisame cuando se libere un lugar</span>
            <span className="block text-xs text-muted">Sólo si en ese momento no tenés un lugar marcado en la sala.</span>
          </span>
          <Switch checked={preferences.seatFreed} disabled={saving} label="Avisame cuando se libere un lugar" onChange={(v) => void update({ seatFreed: v })} />
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <span>
            <span className="block text-sm font-medium text-main">Avisame cuando haya un admin en la sala</span>
            <span className="block text-xs text-muted">Por si necesitás pedir ayuda con un lugar.</span>
          </span>
          <Switch
            checked={preferences.adminPresent}
            disabled={saving}
            label="Avisame cuando haya un admin en la sala"
            onChange={(v) => void update({ adminPresent: v })}
          />
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <span>
            <span className="block text-sm font-medium text-main">Avisarme antes de que venza mi lugar</span>
            <span className="block text-xs text-muted">10 minutos antes, para que puedas seguir acá o liberarlo.</span>
          </span>
          <Switch
            checked={preferences.checkinExpiry}
            disabled={saving}
            label="Avisarme antes de que venza mi lugar"
            onChange={(v) => void update({ checkinExpiry: v })}
          />
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <span>
            <span className="block text-sm font-medium text-main">Novedades por mail</span>
            <span className="block text-xs text-muted">Avisos ocasionales sobre Sala de Estudio. Nunca compartimos tu mail.</span>
          </span>
          <Switch
            checked={preferences.marketingEmails}
            disabled={saving}
            label="Novedades por mail"
            onChange={(v) => void update({ marketingEmails: v })}
          />
        </div>
      </div>

      <div className="rounded-xl border border-app bg-[var(--surface-2)] p-3">
        {support === "unsupported" ? (
          <p className="text-xs text-muted">Este navegador no soporta notificaciones push.</p>
        ) : support === "ios-needs-install" || showIosHint ? (
          <p className="text-xs text-muted">
            En iPhone: agregá la app a la pantalla de inicio (Compartir › Agregar a inicio) para recibir notificaciones.
          </p>
        ) : support === "denied" ? (
          <p className="text-xs text-muted">
            Bloqueaste las notificaciones para este sitio. Para activarlas, habilitalas desde la configuración del navegador.
          </p>
        ) : deviceState === "enabled" ? (
          <p className="text-xs font-medium text-emerald-700">Notificaciones activadas en este dispositivo.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">Activá los avisos anteriores y los de mensajes privados en este dispositivo (además de en la app).</p>
            <button
              type="button"
              onClick={() => void handleEnableDevice()}
              disabled={deviceState === "enabling"}
              className="self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {deviceState === "enabling" ? "Activando…" : "Activar notificaciones en este dispositivo"}
            </button>
            {deviceState === "error" && errorMessage ? (
              <p role="status" className="text-xs text-red-600">
                {errorMessage}
              </p>
            ) : null}
          </div>
        )}
        {deviceState === "enabled" ? (
          <button type="button" onClick={() => void handleDisableDevice()} className="mt-2 text-xs font-semibold text-muted hover:underline">
            Desactivar en este dispositivo
          </button>
        ) : null}
      </div>
    </div>
  );
}
