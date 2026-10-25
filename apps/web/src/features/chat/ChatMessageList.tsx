"use client";
import { ReactionsProvider, MessageReactionBar } from "./MessageReactions";

import type { ChatMessageDto } from "@sala/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStickToBottom } from "./useStickToBottom";
import { Avatar } from "@/components/Avatar";
import { daySeparatorFlags, formatDaySeparator, formatMessageTime, groupMessages } from "./grouping";
import { MessageMenu } from "./MessageMenu";
import { isOwnMessage } from "./unread";

export interface ChatMessageListProps {
  messages: ChatMessageDto[];
  currentUserId: string | null;
  onDelete: (messageId: string) => void;
  onBlock: (userId: string) => void;
  /** Widget: makes other people's avatar and name tappable (opens a private chat). */
  onAuthorClick?: (userId: string, displayName: string) => void;
}

/** Grouping key; alias authors have no userId, so their (unique) alias name stands in. */
function authorKey(message: ChatMessageDto): string {
  return message.author.userId ?? (message.mine ? "mine" : `alias:${message.author.displayName}`);
}

/** Renders the room chat thread: day separators, grouped bubbles, and the per-message menu. */
export function ChatMessageList({ messages, currentUserId, onDelete, onBlock, onAuthorClick }: ChatMessageListProps) {
  const router = useRouter();
  const grouped = groupMessages(messages.map((m) => ({ id: m.id, authorId: authorKey(m), createdAt: m.createdAt })));
  const showSeparators = daySeparatorFlags(messages);

  const lastMessage = messages[messages.length - 1];
  const scrollRef = useStickToBottom<HTMLDivElement>(
    lastMessage?.id ?? null,
    lastMessage !== undefined && isOwnMessage(lastMessage, currentUserId),
  );

  return (
    <ReactionsProvider scope="ROOM" threadId={messages[0]?.chatRoomId ?? null} messageIds={messages.filter((m) => !m.deleted).map((m) => m.id)}>
    <div ref={scrollRef} role="log" aria-live="polite" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {messages.length === 0 ? (
        <p className="m-auto p-6 text-center text-sm text-muted">Todavía no hay mensajes. Escribí el primero.</p>
      ) : null}
      {messages.map((message, index) => {
        const showDaySeparator = showSeparators[index]!;
        const isOwn = isOwnMessage(message, currentUserId);
        const showHeader = !grouped[index]!.grouped || showDaySeparator;
        const authorUserId = message.author.userId;
        const tappable = onAuthorClick !== undefined && authorUserId !== null && !isOwn;
        const avatar = (
          <Avatar userId={authorKey(message)} name={message.author.displayName} url={message.author.avatarUrl} aliasAnimal={message.author.aliasAnimal} size={40} adminBadge={message.author.adminBadge} />
        );

        const separator = showDaySeparator ? (
          <p className="my-2 text-center text-xs font-semibold text-muted">{formatDaySeparator(message.createdAt)}</p>
        ) : null;

        // Own messages sit on the right as a bubble, without avatar, badge or name, like most chat apps.
        if (isOwn) {
          return (
            <div key={message.id}>
              {separator}
              <div className={`group flex items-start justify-end gap-1.5 ${showHeader ? "mt-2.5" : ""}`}>
                {!message.deleted ? (
                  <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    <MessageMenu
                      isOwn
                      onDelete={() => onDelete(message.id)}
                      onReport={() => router.push(`/reportar/${message.author.userId ?? "message-author"}?context=CHAT&messageId=${message.id}`)}
                    />
                  </div>
                ) : null}
                <div className="max-w-[80%] rounded-float rounded-tr-xs bg-primary/15 px-3 py-1.5">
                  <p className={`whitespace-pre-wrap break-words text-sm ${message.deleted ? "italic text-muted" : "text-main"}`}>
                    {message.deleted ? "Mensaje eliminado" : message.content}
                  </p>
                  <p className="mt-0.5 text-right text-[11px] text-muted">{formatMessageTime(message.createdAt)}</p>
                  <MessageReactionBar messageId={message.id} deleted={message.deleted} />
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={message.id}>
            {separator}
            <div
              className={`group flex gap-2.5 rounded-xl px-2 py-1 hover:bg-[var(--surface-2)] ${showHeader ? "mt-2.5" : ""} ${
                isOwn ? "bg-primary/5" : ""
              }`}
            >
              <div className="w-10 shrink-0">
                {showHeader ? (
                  authorUserId !== null ? (
                    <Link
                      href={`/u/${authorUserId}`}
                      aria-label={`Ver perfil de ${message.author.displayName}`}
                      className="block rounded-full transition-transform duration-150 ease-out active:scale-[0.96]"
                    >
                      {avatar}
                    </Link>
                  ) : (
                    avatar
                  )
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                {showHeader ? (
                  <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-semibold text-main">
                    {tappable ? (
                      <button
                        type="button"
                        onClick={() => onAuthorClick(authorUserId, message.author.displayName)}
                        aria-label={`Escribirle a ${message.author.displayName}`}
                        className="min-w-0 truncate rounded text-left hover:underline"
                      >
                        {message.author.displayName}
                      </button>
                    ) : (
                      <span className="min-w-0 truncate">{isOwn ? "Vos" : message.author.displayName}</span>
                    )}
                    <span className="shrink-0 text-xs font-normal text-muted">{formatMessageTime(message.createdAt)}</span>
                  </p>
                ) : null}
                <p className={`whitespace-pre-wrap break-words text-sm ${message.deleted ? "italic text-muted" : "text-main"}`}>
                  {message.deleted ? "Mensaje eliminado" : message.content}
                </p>
                <MessageReactionBar messageId={message.id} deleted={message.deleted} />
              </div>
              {!message.deleted ? (
                <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                  <MessageMenu
                    isOwn={isOwn}
                    onDelete={() => onDelete(message.id)}
                    onReport={() => router.push(`/reportar/${message.author.userId ?? "message-author"}?context=CHAT&messageId=${message.id}`)}
                    onBlock={message.author.userId !== null ? () => onBlock(message.author.userId!) : undefined}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
    </ReactionsProvider>
  );
}
