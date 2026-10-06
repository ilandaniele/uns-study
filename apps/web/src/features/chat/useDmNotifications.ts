"use client";

import { SocketEvents } from "@sala/contracts/events";
import type { DirectMessageDto } from "@sala/contracts";
import { useEffect, useRef } from "react";
import { primeAudio, playDmBlip } from "@/features/focus/focus-audio";
import { getSocket } from "@/lib/socket";
import { useChatSoundEnabled } from "./chat-sound";
import { shouldPlayDmSound } from "./dm-notify";

/**
 * Blips (and vibrates on Android) for incoming private messages that aren't already on screen.
 * Renders nothing; mount it once on every route while signed in.
 */
export function useDmNotifications(args: { currentUserId: string; viewingConversationId: string | null }): void {
  const soundEnabled = useChatSoundEnabled();
  const argsRef = useRef({ ...args, soundEnabled });
  const lastPlayedAtRef = useRef<number | null>(null);

  useEffect(() => {
    argsRef.current = { ...args, soundEnabled };
  });

  useEffect(() => {
    const socket = getSocket();
    const onDm = (message: DirectMessageDto) => {
      const documentVisible = document.visibilityState === "visible";
      const now = Date.now();
      const { currentUserId, viewingConversationId, soundEnabled: enabled } = argsRef.current;
      const play = shouldPlayDmSound({
        message,
        currentUserId,
        soundEnabled: enabled,
        viewingConversationId,
        documentVisible,
        lastPlayedAt: lastPlayedAtRef.current,
        now,
      });
      if (!play) return;
      lastPlayedAtRef.current = now;
      playDmBlip();
      if (documentVisible) {
        try {
          navigator.vibrate?.(30);
        } catch {
          // Vibration is best-effort.
        }
      }
    };
    socket.on(SocketEvents.DmMessageCreated, onDm);
    return () => {
      socket.off(SocketEvents.DmMessageCreated, onDm);
    };
  }, []);

  // Browsers keep audio suspended until a gesture: unlock it on the first tap/key anywhere.
  useEffect(() => {
    const prime = () => primeAudio();
    document.addEventListener("pointerdown", prime, { capture: true, once: true });
    document.addEventListener("keydown", prime, { capture: true, once: true });
    return () => {
      document.removeEventListener("pointerdown", prime, { capture: true });
      document.removeEventListener("keydown", prime, { capture: true });
    };
  }, []);
}
