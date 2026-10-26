"use client";
import { ReactionsProvider, MessageReactionBar, MessageReactionButton } from "./MessageReactions";

import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import type { ConversationDto } from "@sala/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { ChatComposer } from "./ChatComposer";
import { daySeparatorFlags, formatDaySeparator, formatMessageTime, groupMessages } from "./grouping";
import { MessageMenu } from "./MessageMenu";
import { useBlockedUsers } from "./useBlockedUsers";
import { useDmThread } from "./useDmThread";
import { useStickToBottom } from "./useStickToBottom";

const DM_MESSAGE_MAX_LENGTH = 1000;

export interface DmThreadProps {
  conversationId: string;
  currentUserId: string;
  /** Header data; the parent resolves it (list match ?? snapshot ?? null). */
  conversation: ConversationDto | null;
  /** "page" is the /chat/dm/{id} screen; "widget" is the floating chat (compact header, h2). */
  variant?: "page" | "widget";
  /** Widget: back arrow calling this instead of the page's BackButton. */
  onBack?: () => void;
  /** Extra controls at the end of the header, before the message menu. */
  headerEnd?: ReactNode;
  titleId?: string;
  /** Called after each successful mark-read request. */
  onRead?: () => void;
}

/** One private conversation: header, message log and composer. Fills its parent's height. */
export function DmThread({ conversationId, currentUserId, conversation, variant = "page", onBack, headerEnd, titleId, onRead }: DmThreadProps) {
  const widget = variant === "widget";
  const Heading = widget ? "h2" : "h1";
  const router = useRouter();
  const { block } = useBlockedUsers();
  const { messages, loading, loadingMore, hasMore, error, loadMoreError, sendError, reload, loadMore, send } = useDmThread(conversationId, { onRead });

  const otherUserId = conversation?.otherUser.userId ?? null;
  const grouped = groupMessages(messages.map((m) => ({ id: m.id, authorId: m.senderId, createdAt: m.createdAt })));
  const showSeparators = daySeparatorFlags(messages);
  const lastMessage = messages[messages.length - 1];
  const scrollRef = useStickToBottom<HTMLDivElement>(lastMessage?.id ?? null, lastMessage?.senderId === currentUserId);

  return (
    <ReactionsProvider scope="DM" threadId={conversationId} messageIds={messages.filter((m) => !m.deleted).map((m) => m.id)}>
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex items-center justify-between gap-3 border-b border-app bg-surface ${widget ? "py-2.5 pl-2 pr-2" : "px-4 py-3"}`}>
        <div className="flex min-w-0 items-center gap-1">
          {widget ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver"
              title="Volver"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-main transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
            >
              <CaretLeftIcon aria-hidden="true" weight="bold" size={20} />
            </button>
          ) : (
            <BackButton fallbackHref="/chat/dm" />
          )}
          {otherUserId ? (
            <Link href={`/u/${otherUserId}`} aria-hidden="true" tabIndex={-1} className="shrink-0 rounded-full">
              <Avatar
                userId={otherUserId}
                name={conversation?.otherUser.displayName ?? "?"}
                url={conversation?.otherUser.avatarUrl ?? null}
                size={widget ? 32 : 36}
              />
            </Link>
          ) : null}
          <div className="min-w-0">
            <Heading id={titleId} className={`truncate t-title ${widget ? "text-base" : "text-lg"}`}>
              {otherUserId ? (
                <Link href={`/u/${otherUserId}`} className="hover:underline">
                  {conversation?.otherUser.displayName ?? "Conversación"}
                </Link>
              ) : (
                (conversation?.otherUser.displayName ?? "Conversación")
              )}
            </Heading>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerEnd}
          {otherUserId ? (
            <MessageMenu
              isOwn={false}
              onReport={() => router.push(`/reportar/${otherUserId}?context=DM`)}
              onBlock={() => void block(otherUserId)}
            />
          ) : null}
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

            return (
              <div key={message.id}>
                {showDaySeparator ? (
                  <p className="my-2 text-center text-xs font-semibold text-muted">{formatDaySeparator(message.createdAt)}</p>
                ) : null}
                <div className={`group flex items-end gap-1.5 ${isOwn ? "justify-end" : "justify-start"} ${showHeader ? "mt-2" : ""}`}>
                  <div
                    className={`min-w-0 max-w-[75%] rounded-float px-3 py-2 text-sm ${
                      isOwn ? "bg-primary/10 text-main" : "bg-[var(--surface-2)] text-main"
                    }`}
                  >
                    <p className={`whitespace-pre-wrap break-words ${message.deleted ? "italic opacity-70" : ""}`}>
                      {message.deleted ? "Mensaje eliminado" : message.content}
                    </p>
                    <p className="mt-1 text-right font-mono text-[11px] text-muted">{formatMessageTime(message.createdAt)}</p>
                    <MessageReactionBar messageId={message.id} deleted={message.deleted} />
                  </div>
                  {!message.deleted ? <div className={`shrink-0 self-end pb-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 ${isOwn ? "order-first" : ""}`}><MessageReactionButton messageId={message.id} deleted={message.deleted} /></div> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sendError ? <p className="px-4 text-sm text-red-600">{sendError}</p> : null}
      <ChatComposer maxLength={DM_MESSAGE_MAX_LENGTH} onSend={send} analyticsEvent="dm_sent" variant={variant} />
    </div>
    </ReactionsProvider>
  );
}
