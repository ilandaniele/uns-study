"use client";

import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react/dist/ssr";
import { primeAudio, playDmBlip } from "@/features/focus/focus-audio";
import { setChatSoundEnabled, useChatSoundEnabled } from "./chat-sound";

/** Mute/unmute button for the private-message blip. Shown in every widget view header. */
export function ChatSoundToggle({ className = "" }: { className?: string }) {
  const enabled = useChatSoundEnabled();
  const label = "Sonido de mensajes";

  function toggle() {
    const next = !enabled;
    setChatSoundEnabled(next);
    if (next) {
      primeAudio();
      playDmBlip();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!enabled}
      aria-label={label}
      title={enabled ? "Silenciar mensajes privados" : "Activar sonido de mensajes privados"}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-muted transition-transform hover:bg-[var(--surface-2)] active:scale-[0.96] ${className}`}
    >
      {enabled ? <SpeakerHighIcon size={18} aria-hidden /> : <SpeakerSlashIcon size={18} aria-hidden />}
    </button>
  );
}
