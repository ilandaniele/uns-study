"use client";

import Link from "next/link";
import type { ChatMessageDto } from "@sala/contracts";
import { useEffect, type ReactNode } from "react";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { IdentityHelp } from "./IdentityHelp";
import { useBlockedUsers } from "./useBlockedUsers";
import { formatUnread } from "./unread";
import { useRoomChat } from "./useRoomChat";
import { prefetchHandlers } from "@/lib/prefetch";

/** MVP has a single study room (`principal`), which owns the one global chat (`#sala-principal`). */
export const ROOM_CHAT_SLUG = "principal";
const CHAT_MESSAGE_MAX_LENGTH = 500;

type RoomChatPanelProps = {
  currentUserId: string;
  /** "page" is the full /chat screen; "widget" is the floating chat, which drops the identity help. */
  variant?: "page" | "widget";
  /** Extra controls at the end of the header row, e.g. the widget's close button. */
  headerEnd?: ReactNode;
  titleId?: string;
  /** Called with the visible messages whenever they change (the widget derives its unread badge from it). */
  onMessagesChange?: (messages: ChatMessageDto[]) => void;
  /** Unread private messages, shown on the "Privados" link. */
  dmUnread?: number;
};

/** The room's live chat: header with connection state, the message log and the composer. Fills its parent's height. */
export function RoomChatPanel({ currentUserId, variant = "page", headerEnd, titleId, onMessagesChange, dmUnread = 0 }: RoomChatPanelProps) {
  const widget = variant === "widget";
  // The widget floats over pages that already have their own h1.
  const Heading = widget ? "h2" : "h1";
  const { blockedIds, block } = useBlockedUsers();
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMoreError,
    sendError,
    connected,
    everConnected,
    reload,
    loadMore,
    send,
    remove,
  } = useRoomChat(ROOM_CHAT_SLUG, blockedIds);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  return (
    <>
      <div className={`flex items-center justify-between gap-3 border-b border-app bg-surface ${widget ? "py-2.5 pl-4 pr-2" : "px-4 py-3"}`}>
        <div className="min-w-0">
          <Heading
            id={titleId}
            className={`font-display font-extrabold uppercase leading-none tracking-[0.01em] text-main ${widget ? "text-[17px]" : "text-[22px]"}`}
          >
            # Sala de Estudio
          </Heading>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-muted"}`}
              aria-hidden="true"
            />
            {connected ? "En vivo" : everConnected ? "Reconectando…" : "Conectando…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/chat/dm"
            {...prefetchHandlers("/chat/dm")}
            aria-label={dmUnread > 0 ? `${widget ? "Privados" : "Mensajes privados"}, ${dmUnread} sin leer` : undefined}
            className={`flex items-center gap-1.5 rounded-lg border border-app font-medium text-main hover:bg-[var(--surface-2)] ${widget ? "px-2.5 py-1.5 text-xs" : "px-3 py-1.5 text-sm"}`}
          >
            {widget ? "Privados" : "Mensajes privados"}
            {dmUnread > 0 ? (
              <span className="min-w-[18px] rounded-full bg-[var(--seat-occupied)] px-1 text-center text-[11px] font-bold leading-[18px] text-white tabular-nums">
                {formatUnread(dmUnread)}
              </span>
            ) : null}
          </Link>
          {headerEnd}
        </div>
      </div>
      {widget ? null : (
        <div className="lg:hidden">
          <IdentityHelp />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {connected ? "Conectado" : everConnected ? "Reconectando" : "Conectando"}
      </p>

      {loading ? (
        <p className="flex-1 p-6 text-center text-muted">Cargando chat…</p>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center gap-3 p-6 text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {hasMore ? (
            <div className="flex flex-col items-center gap-1 py-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-muted hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                {loadingMore ? "Cargando…" : "Cargar anteriores"}
              </button>
              {loadMoreError ? <p className="text-xs text-red-600 dark:text-red-400">{loadMoreError}</p> : null}
            </div>
          ) : null}
          <ChatMessageList
            messages={messages}
            currentUserId={currentUserId}
            onDelete={(id) => void remove(id)}
            onBlock={(userId) => void block(userId)}
          />
        </>
      )}

      {sendError ? <p className="px-4 text-sm text-red-600 dark:text-red-400">{sendError}</p> : null}
      <ChatComposer maxLength={CHAT_MESSAGE_MAX_LENGTH} onSend={send} />
    </>
  );
}
