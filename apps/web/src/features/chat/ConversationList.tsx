"use client";

import type { ConversationDto } from "@sala/contracts";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { prefetchHandlers } from "@/lib/prefetch";
import { formatMessageTime } from "./grouping";
import { UnreadBadge } from "./UnreadBadge";

export interface ConversationListProps {
  conversations: readonly ConversationDto[];
  loading: boolean;
  error: string | null;
  /** Widget: rows are buttons calling this. Page (omitted): rows are links to /chat/dm/{id}. */
  onSelect?: (conversationId: string) => void;
  variant?: "page" | "widget";
}

/** The user's private conversations, newest first as given. Loading, error and empty states render in place. */
export function ConversationList({ conversations, loading, error, onSelect, variant = "page" }: ConversationListProps) {
  const widget = variant === "widget";

  if (loading) return <p className="p-6 text-center text-muted">Cargando conversaciones…</p>;
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
  if (conversations.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted">
        {widget
          ? "Todavía no tenés conversaciones. Tocá a alguien en el chat de la sala para escribirle."
          : "Todavía no tenés conversaciones. Escribile a alguien desde su perfil."}
      </p>
    );
  }

  const listClass = widget
    ? "flex min-h-0 flex-1 flex-col divide-y divide-[var(--border)] overflow-y-auto"
    : "flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-[14px] border border-app bg-surface";
  const rowClass = `flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)] ${widget ? "active:bg-[var(--surface-2)]" : ""}`;

  return (
    <ul className={listClass}>
      {conversations.map((conversation) => {
        const content = (
          <>
            <Avatar
              userId={conversation.otherUser.userId}
              name={conversation.otherUser.displayName}
              url={conversation.otherUser.avatarUrl}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${conversation.unread > 0 ? "font-bold text-main" : "font-semibold text-main"}`}>
                {conversation.otherUser.displayName}
              </p>
              <p className={`truncate text-xs ${conversation.unread > 0 ? "font-medium text-main" : "text-muted"}`}>
                {conversation.lastMessage?.deleted ? "Mensaje eliminado" : conversation.lastMessage?.content ?? "Sin mensajes todavía"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {conversation.lastMessageAt ? (
                <span className="text-[11px] text-muted">{formatMessageTime(conversation.lastMessageAt)}</span>
              ) : null}
              <UnreadBadge count={conversation.unread} />
            </div>
          </>
        );

        return (
          <li key={conversation.id}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(conversation.id)} className={rowClass}>
                {content}
              </button>
            ) : (
              <Link href={`/chat/dm/${conversation.id}`} {...prefetchHandlers(`/chat/dm/${conversation.id}`)} className={rowClass}>
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
