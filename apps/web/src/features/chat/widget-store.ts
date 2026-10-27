"use client";

import type { ConversationDto, GroupConversationDto } from "@sala/contracts";
import { useSyncExternalStore } from "react";
import { recordSectionVisit } from "@/lib/section-usage";

export type ChatWidgetView =
  | { kind: "room" }
  | { kind: "list" }
  // `conversation` = optional snapshot (from create-or-get) for the header until the list refetch includes it.
  | { kind: "dm"; conversationId: string; conversation?: ConversationDto }
  // `group` = optional snapshot (from create) for the header until the list refetch includes it.
  | { kind: "group"; groupId: string; group?: GroupConversationDto }
  | { kind: "new-group" };

export type ChatNavDirection = "none" | "forward" | "back";

export interface ChatWidgetState {
  open: boolean;
  /** Never empty; stack[0] is always `{ kind: "list" }`. */
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

export const initialChatWidgetState: ChatWidgetState = { open: false, stack: [LIST, ROOM], direction: "none" };

function sameView(a: ChatWidgetView, b: ChatWidgetView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "dm") return a.conversationId === (b as { conversationId: string }).conversationId;
  if (a.kind === "group") return a.groupId === (b as { groupId: string }).groupId;
  return true;
}

function isThread(view: ChatWidgetView): boolean {
  return view.kind === "dm" || view.kind === "group";
}

export function topView(state: ChatWidgetState): ChatWidgetView {
  return state.stack[state.stack.length - 1];
}

/** Stable key for keyed rendering / animation: "room" | "list" | "new-group" | `dm:${id}` | `group:${id}`. */
export function viewKey(view: ChatWidgetView): string {
  if (view.kind === "dm") return `dm:${view.conversationId}`;
  if (view.kind === "group") return `group:${view.groupId}`;
  return view.kind;
}

/** Pure. Returns the SAME object reference for no-ops. */
export function chatWidgetReducer(state: ChatWidgetState, action: ChatWidgetAction): ChatWidgetState {
  switch (action.type) {
    case "open": {
      if (!action.view) {
        if (state.open) return state;
        // Opening the bubble always lands on the room, with the chat list one step back.
        return { open: true, stack: [LIST, ROOM], direction: "none" };
      }
      if (state.open && sameView(topView(state), action.view)) return state;
      const stack: ChatWidgetView[] =
        action.view.kind === "room" ? [LIST, ROOM] : action.view.kind === "list" ? [LIST] : [LIST, action.view];
      return { open: true, stack, direction: state.open ? "forward" : "none" };
    }
    case "close":
      if (!state.open) return state;
      return { ...state, open: false, direction: "none" };
    case "push": {
      const top = topView(state);
      if (!state.open || sameView(top, action.view)) return state;
      const index = state.stack.findIndex((v) => sameView(v, action.view));
      if (index >= 0) return { ...state, stack: state.stack.slice(0, index + 1), direction: "back" };
      const replaceTop = top.kind === "new-group" || (isThread(top) && isThread(action.view));
      const base = replaceTop ? state.stack.slice(0, -1) : state.stack;
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
  | { view: "dm"; conversationId: string; conversation?: ConversationDto }
  | { view: "group"; groupId: string; group?: GroupConversationDto };

export function openChatWidget(target?: OpenChatWidgetTarget): void {
  if (!current.open) recordSectionVisit("chat");
  if (!target) return dispatch({ type: "open" });
  if (target.view === "dm") {
    return dispatch({ type: "open", view: { kind: "dm", conversationId: target.conversationId, conversation: target.conversation } });
  }
  if (target.view === "group") {
    return dispatch({ type: "open", view: { kind: "group", groupId: target.groupId, group: target.group } });
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
