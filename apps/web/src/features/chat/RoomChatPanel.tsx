"use client";

import { CaretLeftIcon, QuestionIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ChatMessageDto } from "@sala/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { IdentityHelp } from "./IdentityHelp";
import { useBlockedUsers } from "./useBlockedUsers";
import { UnreadBadge } from "./UnreadBadge";
import { useRoomChat } from "./useRoomChat";
import { useMyProfile } from "@/features/profile/useMyProfile";
import { prefetchHandlers } from "@/lib/prefetch";

/** MVP has a single study room (`principal`), which owns the one global chat (`#sala-principal`). */
export const ROOM_CHAT_SLUG = "principal";
const CHAT_MESSAGE_MAX_LENGTH = 500;

type RoomChatPanelProps = {
  currentUserId: string;
  /** "page" is the full /chat screen; "widget" is the floating chat, where the identity help hides behind a "?" button. */
  variant?: "page" | "widget";
  /** Extra controls at the end of the header row, e.g. the widget's close button. */
  headerEnd?: ReactNode;
  titleId?: string;
  /** Called with the visible messages whenever they change (the widget derives its unread badge from it). */
  onMessagesChange?: (messages: ChatMessageDto[]) => void;
  /** Unread private messages (DMs plus groups), shown on the "Privados" link / the widget's back caret. */
  dmUnread?: number;
  /** Widget: a caret before the heading calling this (back to the chat list); the page keeps its /chat/dm link. */
  onBack?: () => void;
  /** Forwarded to ChatMessageList.onAuthorClick (tap an author to message them). */
  onOpenUser?: (userId: string, displayName: string) => void;
  /** Shown under the header (e.g. widget DM-open errors), with a dismiss button. */
  notice?: string | null;
  onDismissNotice?: () => void;
};

/** The room's live chat: header with connection state, the message log and the composer. Fills its parent's height. */
export function RoomChatPanel({ currentUserId, variant = "page", headerEnd, titleId, onMessagesChange, dmUnread = 0, onBack, onOpenUser, notice, onDismissNotice }: RoomChatPanelProps) {
  const widget = variant === "widget";
  // The widget floats over pages that already have their own h1.
  const Heading = widget ? "h2" : "h1";
  const { blockedIds, block } = useBlockedUsers();
  const { profile, privacy } = useMyProfile();
  const [helpOpen, setHelpOpen] = useState(false);
  // Same condition IdentityHelp uses to render; without it the "?" button would open nothing.
  const needsIdentityHelp = Boolean(profile && privacy && (profile.identityMode === "HIDDEN" || !privacy.showAvatar || !profile.avatarUrl));
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

  const showBack = widget && Boolean(onBack);
  const privadosLabel = dmUnread > 0 ? `Mensajes privados, ${dmUnread} sin leer` : undefined;
  const backLabel = dmUnread > 0 ? `Ver chats privados, ${dmUnread} sin leer` : "Ver chats privados";

  return (
    <>
      <div className={`flex items-center justify-between gap-3 border-b border-app bg-surface ${widget ? `py-2.5 pr-2 ${showBack ? "pl-2" : "pl-4"}` : "px-4 py-3"}`}>
        <div className="flex min-w-0 items-center gap-1">
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              title="Ver chats privados"
              className="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-main transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
            >
              <CaretLeftIcon aria-hidden="true" weight="bold" size={20} />
              <UnreadBadge count={dmUnread} size="sm" className="absolute -right-0.5 -top-0.5 ring-2 ring-[var(--bg)]" />
            </button>
          ) : null}
          <div className="min-w-0">
          <Heading
            id={titleId}
            className={`font-display font-extrabold uppercase leading-none tracking-[0.01em] text-main ${widget ? "text-[17px]" : "text-[22px]"}`}
          >
            <span aria-hidden="true">#</span> Sala de Estudio
          </Heading>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-primary" : "bg-[var(--text-faint)]"}`}
              aria-hidden="true"
            />
            {connected ? "En vivo" : everConnected ? "Reconectando…" : "Conectando…"}
          </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {widget && needsIdentityHelp ? (
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              aria-expanded={helpOpen}
              aria-label="Cómo funciona tu identidad en el chat"
              title="Cómo funciona tu identidad en el chat"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.96]"
            >
              <QuestionIcon aria-hidden="true" weight="bold" size={18} />
            </button>
          ) : null}
          {widget ? null : (
            <Link
              href="/chat/dm"
              {...prefetchHandlers("/chat/dm")}
              aria-label={privadosLabel}
              className="flex items-center gap-1.5 rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
            >
              Mensajes privados
              <UnreadBadge count={dmUnread} size="sm" />
            </Link>
          )}
          {headerEnd}
        </div>
      </div>
      {widget ? (
        helpOpen ? <IdentityHelp defaultOpen /> : null
      ) : (
        <div className="lg:hidden">
          <IdentityHelp />
        </div>
      )}
      {notice ? (
        <p role="status" className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-app bg-[var(--surface-2)] py-1.5 pl-3 pr-1 text-xs text-main">
          <span className="min-w-0 flex-1 py-1">{notice}</span>
          {onDismissNotice ? (
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Cerrar aviso"
              className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--surface-2)]"
            >
              <XIcon aria-hidden="true" weight="bold" size={14} />
            </button>
          ) : null}
        </p>
      ) : null}
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
            onAuthorClick={onOpenUser}
          />
        </>
      )}

      {sendError ? <p className="px-4 text-sm text-red-600 dark:text-red-400">{sendError}</p> : null}
      <ChatComposer maxLength={CHAT_MESSAGE_MAX_LENGTH} onSend={send} variant={variant} />
    </>
  );
}
