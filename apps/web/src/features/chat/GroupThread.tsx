"use client";

import { CaretLeftIcon, DotsThreeVerticalIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { GROUP_MESSAGE_MAX_LENGTH, type GroupConversationDto } from "@sala/contracts";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { ChatComposer } from "./ChatComposer";
import { groupErrorMessage, leaveGroup } from "./group-actions";
import { daySeparatorFlags, formatDaySeparator, formatMessageTime, groupMessages } from "./grouping";
import { useBlockedUsers } from "./useBlockedUsers";
import { useGroupThread } from "./useGroupThread";
import { useStickToBottom } from "./useStickToBottom";

export interface GroupThreadProps {
  groupId: string;
  /** Header data; the parent resolves it (list match ?? snapshot ?? null). */
  group: GroupConversationDto | null;
  currentUserId: string;
  onBack: () => void;
  /** Called after the caller successfully left the group. */
  onLeft: () => void;
  /** Extra controls at the end of the header, before the options menu. */
  headerEnd?: ReactNode;
  titleId?: string;
  /** Called after each successful mark-read request. */
  onRead?: () => void;
}

/** One group chat inside the floating widget: header, message log and composer. Fills its parent's height. */
export function GroupThread({ groupId, group, currentUserId, onBack, onLeft, headerEnd, titleId, onRead }: GroupThreadProps) {
  const { blockedIds } = useBlockedUsers();
  const { messages: allMessages, loading, loadingMore, hasMore, error, loadMoreError, sendError, reload, loadMore, send } = useGroupThread(groupId, { onRead });
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Members can't block each other out of a group, so blocked senders are hidden client-side.
  const messages = allMessages.filter((m) => !blockedIds.has(m.senderId));
  const grouped = groupMessages(messages.map((m) => ({ id: m.id, authorId: m.senderId, createdAt: m.createdAt })));
  const showSeparators = daySeparatorFlags(messages);
  const lastMessage = messages[messages.length - 1];
  const scrollRef = useStickToBottom<HTMLDivElement>(lastMessage?.id ?? null, lastMessage?.senderId === currentUserId);

  async function handleLeave() {
    setMenuOpen(false);
    if (leaving || !window.confirm("¿Salir de este grupo?")) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await leaveGroup(groupId);
      onLeft();
    } catch (err) {
      setLeaveError(groupErrorMessage(err));
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-app bg-surface py-2.5 pl-2 pr-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            title="Volver"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-main transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
          >
            <CaretLeftIcon aria-hidden="true" weight="bold" size={20} />
          </button>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-muted"
          >
            <UsersThreeIcon weight="bold" size={18} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="truncate t-title">
              {group?.name ?? "Grupo"}
            </h2>
            {group ? (
              <p className="text-xs text-muted">
                {group.members.length} {group.members.length === 1 ? "persona" : "personas"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerEnd}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Opciones del grupo"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-[var(--surface-2)] hover:text-main"
            >
              <DotsThreeVerticalIcon aria-hidden="true" size={18} weight="bold" />
            </button>
            {menuOpen ? (
              <>
                <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} tabIndex={-1} />
                <div
                  role="menu"
                  className="menu-enter absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-float border border-app bg-surface text-sm shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleLeave()}
                    className="block min-h-11 w-full px-3 py-2 text-left text-red-600 hover:bg-[var(--surface-2)]"
                  >
                    Salir del grupo
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="flex-1 p-6 text-center text-muted">Cargando conversación…</p>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center gap-3 p-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div ref={scrollRef} role="log" aria-live="polite" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {hasMore ? (
            <div className="flex flex-col items-center gap-1 pb-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-muted hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                {loadingMore ? "Cargando…" : "Cargar anteriores"}
              </button>
              {loadMoreError ? <p className="text-xs text-red-600">{loadMoreError}</p> : null}
            </div>
          ) : null}
          {messages.map((message, index) => {
            const showDaySeparator = showSeparators[index]!;
            const isOwn = message.senderId === currentUserId;
            const showHeader = !grouped[index]!.grouped || showDaySeparator;
            const profileHref = `/u/${message.senderId}`;

            return (
              <div key={message.id}>
                {showDaySeparator ? (
                  <p className="my-2 text-center text-xs font-semibold text-muted">{formatDaySeparator(message.createdAt)}</p>
                ) : null}
                <div className={`flex items-end gap-2 ${isOwn ? "justify-end" : "justify-start"} ${showHeader ? "mt-2" : ""}`}>
                  {!isOwn ? (
                    <div className="w-8 shrink-0">
                      {showHeader ? (
                        <Link href={profileHref} aria-hidden="true" tabIndex={-1} className="block rounded-full">
                          <Avatar
                            userId={message.senderId}
                            name={message.senderName}
                            url={message.senderAvatarUrl}
                            aliasAnimal={message.senderAliasAnimal}
                            size={32}
                          />
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className={`max-w-[75%] rounded-float px-3 py-2 text-sm ${
                      isOwn ? "bg-primary/10 text-main" : "bg-[var(--surface-2)] text-main"
                    }`}
                  >
                    {!isOwn && showHeader ? (
                      <p className="mb-0.5 truncate text-xs font-semibold text-muted">
                        <Link href={profileHref} className="hover:underline">
                          {message.senderName}
                        </Link>
                      </p>
                    ) : null}
                    <p className={`whitespace-pre-wrap break-words ${message.deleted ? "italic opacity-70" : ""}`}>
                      {message.deleted ? "Mensaje eliminado" : message.content}
                    </p>
                    <p className="mt-1 text-right font-mono text-[11px] text-muted">{formatMessageTime(message.createdAt)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {leaveError ? <p className="px-4 text-sm text-red-600">{leaveError}</p> : null}
      {sendError ? <p className="px-4 text-sm text-red-600">{sendError}</p> : null}
      <ChatComposer maxLength={GROUP_MESSAGE_MAX_LENGTH} onSend={send} analyticsEvent="group_sent" variant="widget" />
    </div>
  );
}
