"use client";

import { SocketEvents } from "@sala/contracts/events";
import type { DirectMessageDto, GroupMessageDto } from "@sala/contracts";
import { useEffect, useRef } from "react";
import { primeAudio, playDmBlip } from "@/features/focus/focus-audio";
import { getSocket } from "@/lib/socket";
import { useChatSoundEnabled } from "./chat-sound";
import { shouldPlayDmSound, shouldPlayGroupSound } from "./dm-notify";
import { useBlockedUsers } from "./useBlockedUsers";

/**
 * Blips (and vibrates on Android) for incoming private and group messages that aren't already on screen.
 * Renders nothing; mount it once on every route while signed in.
 */
export function useDmNotifications(args: { currentUserId: string; viewingConversationId: string | null; viewingGroupId?: string | null }): void {
  const soundEnabled = useChatSoundEnabled();
  const { blockedIds } = useBlockedUsers();
  const argsRef = useRef({ ...args, soundEnabled, blockedIds });
  const lastPlayedAtRef = useRef<number | null>(null);

  useEffect(() => {
    argsRef.current = { ...args, soundEnabled, blockedIds };
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
      blip(now, documentVisible);
    };
    const onGroup = (message: GroupMessageDto) => {
      const documentVisible = document.visibilityState === "visible";
      const now = Date.now();
      const { currentUserId, viewingGroupId = null, soundEnabled: enabled, blockedIds: blocked } = argsRef.current;
      // Members can't block each other out of a group, so a blocked sender is silenced here.
      if (blocked.has(message.senderId)) return;
      const play = shouldPlayGroupSound({
        message,
        currentUserId,
        soundEnabled: enabled,
        viewingGroupId,
        documentVisible,
        lastPlayedAt: lastPlayedAtRef.current,
        now,
      });
      if (!play) return;
      blip(now, documentVisible);
    };
    function blip(now: number, documentVisible: boolean) {
      lastPlayedAtRef.current = now;
      playDmBlip();
      if (documentVisible) {
        try {
          navigator.vibrate?.(30);
        } catch {
          // Vibration is best-effort.
        }
      }
    }
    socket.on(SocketEvents.DmMessageCreated, onDm);
    socket.on(SocketEvents.GroupMessageCreated, onGroup);
    return () => {
      socket.off(SocketEvents.DmMessageCreated, onDm);
      socket.off(SocketEvents.GroupMessageCreated, onGroup);
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
