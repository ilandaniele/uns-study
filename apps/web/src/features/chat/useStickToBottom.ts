"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Keeps a scrollable message list pinned to the latest message: it opens at the bottom, and it
 * follows new messages while the reader is at (or near) the bottom or when they sent the message
 * themselves. Loading older messages (prepended) never moves the view, because only a change of
 * the *last* message id triggers a scroll.
 */
export function useStickToBottom<T extends HTMLElement>(lastMessageId: string | null, lastIsMine: boolean) {
  const ref = useRef<T>(null);
  const lastIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !lastMessageId || lastMessageId === lastIdRef.current) return;
    const firstRender = lastIdRef.current === null;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    lastIdRef.current = lastMessageId;
    if (firstRender || nearBottom || lastIsMine) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, lastIsMine]);

  return ref;
}
