"use client";

import { HashIcon, PlusIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import type { ConversationDto, GroupConversationDto } from "@sala/contracts";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { prefetchHandlers } from "@/lib/prefetch";
import { mergeChatRows, type ChatRow } from "./chat-rows";
import { formatMessageTime } from "./grouping";
import { EnableChatPushCta } from "./EnableChatPushCta";
import { UnreadBadge } from "./UnreadBadge";

export interface ConversationListProps {
  conversations: readonly ConversationDto[];
  /** Widget only: group chats, merged with the conversations by latest activity. */
  groups?: readonly GroupConversationDto[];
  loading: boolean;
  error: string | null;
  /** Widget: rows are buttons calling this. Page (omitted): rows are links to /chat/dm/{id}. */
  onSelect?: (conversationId: string) => void;
  onSelectGroup?: (groupId: string) => void;
  /** Widget: pinned "# Sala de Estudio" first row. */
  onOpenRoom?: () => void;
  roomUnread?: number;
  /** Widget: "Nuevo grupo" button row. */
  onNewGroup?: () => void;
  /** Widget: tells "Vos" apart from other senders in a group's last-message preview. */
  currentUserId?: string;
  variant?: "page" | "widget";
}

const widgetRowClass = "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]";

/** The user's private conversations (and, in the widget, groups), newest first. Loading, error and empty states render in place. */
export function ConversationList({
  conversations,
  groups = [],
  loading,
  error,
  onSelect,
  onSelectGroup,
  onOpenRoom,
  roomUnread = 0,
  onNewGroup,
  currentUserId,
  variant = "page",
}: ConversationListProps) {
  const widget = variant === "widget";

  const pinned = widget ? (
    <>
      {onOpenRoom ? (
        <li>
          <button type="button" onClick={onOpenRoom} className={widgetRowClass}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <HashIcon weight="bold" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${roomUnread > 0 ? "font-bold text-main" : "font-semibold text-main"}`}>Sala de Estudio</p>
              <p className="truncate text-xs text-muted">Chat de todas las personas en la sala</p>
            </div>
            <UnreadBadge count={roomUnread} />
          </button>
        </li>
      ) : null}
      {onNewGroup ? (
        <li>
          <button type="button" onClick={onNewGroup} className={widgetRowClass}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-main"
            >
              <PlusIcon weight="bold" size={18} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-main">Nuevo grupo</span>
          </button>
        </li>
      ) : null}
    </>
  ) : null;

  const listClass = widget
    ? "flex min-h-0 flex-1 flex-col divide-y divide-[var(--border)] overflow-y-auto"
    : "flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-[14px] border border-app bg-surface";
  const rowClass = `flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)] ${widget ? "active:bg-[var(--surface-2)]" : ""}`;

  if (!widget) {
    if (loading) return <p className="p-6 text-center text-muted">Cargando conversaciones…</p>;
    if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
    if (conversations.length === 0) {
      return <p className="p-6 text-center text-sm text-muted">Todavía no tenés conversaciones. Escribile a alguien desde su perfil.</p>;
    }
  }

  // The page keeps the order the API gave; the widget interleaves groups by latest activity.
  const rows: ChatRow[] = widget
    ? mergeChatRows(conversations, groups)
    : conversations.map((conversation) => ({ kind: "dm", sortAt: conversation.lastMessageAt ?? "", conversation }));

  let status: string | null = null;
  let statusClass = "text-muted";
  if (widget) {
    if (loading) status = "Cargando conversaciones…";
    else if (error) {
      status = error;
      statusClass = "text-red-600";
    } else if (rows.length === 0) {
      status = "Todavía no tenés chats privados. Tocá el nombre de alguien en el chat de la sala para escribirle.";
    }
  }

  return (
    <ul className={listClass}>
      {pinned}
      <EnableChatPushCta />
      {widget && status ? (
        <li className={`p-6 text-center text-sm ${statusClass}`}>{status}</li>
      ) : null}
      {widget && (loading || error) ? null : rows.map((row) => {
        if (row.kind === "group") {
          const group = row.group;
          const others = group.members.filter((m) => m.userId !== currentUserId).slice(0, 2);
          const last = group.lastMessage;
          const preview = last
            ? last.deleted
              ? "Mensaje eliminado"
              : `${last.senderId === currentUserId ? "Vos" : last.senderName}: ${last.content ?? ""}`
            : "Sin mensajes todavía";
          return (
            <li key={`group:${group.id}`}>
              <button type="button" onClick={() => onSelectGroup?.(group.id)} className={rowClass}>
                {others.length >= 2 ? (
                  <span aria-hidden="true" className="relative h-10 w-10 shrink-0">
                    <span className="absolute left-0 top-0 rounded-full ring-2 ring-[var(--bg)]">
                      <Avatar userId={others[0]!.userId} name={others[0]!.displayName} url={others[0]!.avatarUrl} aliasAnimal={others[0]!.aliasAnimal} size={26} />
                    </span>
                    <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--bg)]">
                      <Avatar userId={others[1]!.userId} name={others[1]!.displayName} url={others[1]!.avatarUrl} aliasAnimal={others[1]!.aliasAnimal} size={26} />
                    </span>
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted"
                  >
                    <UsersThreeIcon weight="bold" size={20} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${group.unread > 0 ? "font-bold text-main" : "font-semibold text-main"}`}>{group.name}</p>
                  <p className={`truncate text-xs ${group.unread > 0 ? "font-medium text-main" : "text-muted"}`}>{preview}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-muted">{formatMessageTime(group.lastMessageAt ?? group.createdAt)}</span>
                  <UnreadBadge count={group.unread} />
                </div>
              </button>
            </li>
          );
        }

        const conversation = row.conversation;
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
