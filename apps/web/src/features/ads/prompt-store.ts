"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Bottom-of-screen prompts that must never stack: the donation sheet and the Pro promo card.
 * Each one publishes whether it is on screen; the other waits while it is.
 */
export type PromptId = "donate" | "subscribe-promo";

let open: ReadonlySet<PromptId> = new Set();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setPromptOpen(id: PromptId, isOpen: boolean): void {
  if (open.has(id) === isOpen) return;
  const next = new Set(open);
  if (isOpen) next.add(id);
  else next.delete(id);
  open = next;
  listeners.forEach((l) => l());
}

/** Publishes `visible` for `id` and clears it on unmount. */
export function usePublishPrompt(id: PromptId, visible: boolean): void {
  useEffect(() => {
    setPromptOpen(id, visible);
    return () => setPromptOpen(id, false);
  }, [id, visible]);
}

/** True while some prompt other than `self` is on screen. */
export function useOtherPromptOpen(self: PromptId): boolean {
  return useSyncExternalStore(
    subscribe,
    () => [...open].some((id) => id !== self),
    () => false,
  );
}
