"use client";

import type { ConversationDto } from "@sala/contracts";
import { useSyncExternalStore } from "react";

export type ChatWidgetView =
  | { kind: "room" }
  | { kind: "list" }
  // `conversation` = optional snapshot (from create-or-get) for the header until the list refetch includes it.
  | { kind: "dm"; conversationId: string; conversation?: ConversationDto };

export type ChatNavDirection = "none" | "forward" | "back";

export interface ChatWidgetState {
  open: boolean;
  /** Never empty; stack[0] is always `{ kind: "room" }`. */
  stack: readonly ChatWidgetView[];
  /** How the current top view was reached; "none" = card just opened. */
  direction: ChatNavDirection;
}

export type ChatWidgetAction =
  | { type: "open"; view?: ChatWidgetView }
  | { type: "close" }
  | { type: "push"; view: ChatWidgetView }
  | { type: "back" }
  | { type: "reset" };

const ROOM: ChatWidgetView = { kind: "room" };
const LIST: ChatWidgetView = { kind: "list" };

export const initialChatWidgetState: ChatWidgetState = { open: false, stack: [ROOM], direction: "none" };

function sameView(a: ChatWidgetView, b: ChatWidgetView): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "dm" || a.conversationId === (b as { conversationId: string }).conversationId;
}

export function topView(state: ChatWidgetState): ChatWidgetView {
  return state.stack[state.stack.length - 1];
}

/** Stable key for keyed rendering / animation: "room" | "list" | `dm:${id}`. */
export function viewKey(view: ChatWidgetView): string {
  return view.kind === "dm" ? `dm:${view.conversationId}` : view.kind;
}

/** Conversation id when the card is open AND a DM is on top; else null. */
export function openDmId(state: ChatWidgetState): string | null {
  const top = topView(state);
  return state.open && top.kind === "dm" ? top.conversationId : null;
}

/** Pure. Returns the SAME object reference for no-ops. */
export function chatWidgetReducer(state: ChatWidgetState, action: ChatWidgetAction): ChatWidgetState {
  switch (action.type) {
    case "open": {
      if (!action.view) {
        if (state.open) return state;
        return { ...state, open: true, direction: "none" };
      }
      if (state.open && sameView(topView(state), action.view)) return state;
      const stack: ChatWidgetView[] =
        action.view.kind === "room" ? [ROOM] : action.view.kind === "list" ? [ROOM, LIST] : [ROOM, LIST, action.view];
      return { open: true, stack, direction: state.open ? "forward" : "none" };
    }
    case "close":
      if (!state.open) return state;
      return { ...state, open: false, direction: "none" };
    case "push": {
      const top = topView(state);
      if (!state.open || sameView(top, action.view)) return state;
      const base = top.kind === "dm" && action.view.kind === "dm" ? state.stack.slice(0, -1) : state.stack;
      return { ...state, stack: [...base, action.view], direction: "forward" };
    }
    case "back":
      if (state.stack.length <= 1) return state;
      return { ...state, stack: state.stack.slice(0, -1), direction: "back" };
    case "reset":
      return initialChatWidgetState;
  }
}

// Imperative API (module singleton, same pattern as lib/me-store.ts).
let current: ChatWidgetState = initialChatWidgetState;
const listeners = new Set<() => void>();

function dispatch(action: ChatWidgetAction): void {
  const next = chatWidgetReducer(current, action);
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export type OpenChatWidgetTarget =
  | { view: "room" }
  | { view: "list" }
  | { view: "dm"; conversationId: string; conversation?: ConversationDto };

export function openChatWidget(target?: OpenChatWidgetTarget): void {
  if (!target) return dispatch({ type: "open" });
  if (target.view === "dm") {
    return dispatch({ type: "open", view: { kind: "dm", conversationId: target.conversationId, conversation: target.conversation } });
  }
  dispatch({ type: "open", view: { kind: target.view } });
}

export function closeChatWidget(): void {
  dispatch({ type: "close" });
}

export function pushChatView(view: ChatWidgetView): void {
  dispatch({ type: "push", view });
}

export function backChatView(): void {
  dispatch({ type: "back" });
}

export function resetChatWidget(): void {
  dispatch({ type: "reset" });
}

export function getChatWidgetState(): ChatWidgetState {
  return current;
}

export function subscribeChatWidget(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverSnapshot = (): ChatWidgetState => initialChatWidgetState;

export function useChatWidget(): ChatWidgetState {
  return useSyncExternalStore(subscribeChatWidget, getChatWidgetState, serverSnapshot);
}
