"use client";

import type { ChatMessageDto } from "@uns/contracts";
import { useRouter } from "next/navigation";
import { daySeparatorFlags, formatDaySeparator, formatMessageTime, groupMessages } from "./grouping";
import { MessageMenu } from "./MessageMenu";

export interface ChatMessageListProps {
  messages: ChatMessageDto[];
  currentUserId: string | null;
  onDelete: (messageId: string) => void;
  onBlock: (userId: string) => void;
}

/** Renders the room chat thread: day separators, grouped bubbles, and the per-message menu. */
export function ChatMessageList({ messages, currentUserId, onDelete, onBlock }: ChatMessageListProps) {
  const router = useRouter();
  const grouped = groupMessages(messages.map((m) => ({ id: m.id, authorId: m.author.userId, createdAt: m.createdAt })));
  const showSeparators = daySeparatorFlags(messages);

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {messages.map((message, index) => {
        const showDaySeparator = showSeparators[index]!;
        const isOwn = currentUserId !== null && message.author.userId === currentUserId;
        const showHeader = !grouped[index]!.grouped || showDaySeparator;

        return (
          <div key={message.id}>
            {showDaySeparator ? (
              <p className="my-2 text-center text-xs font-semibold text-slate-400">{formatDaySeparator(message.createdAt)}</p>
            ) : null}
            <div
              className={`group flex gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 ${showHeader ? "mt-2" : ""} ${
                isOwn ? "bg-primary/5" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                {showHeader ? (
                  <p className="text-xs font-semibold text-slate-600">
                    {isOwn ? "Vos" : message.author.displayName} <span className="font-normal text-slate-400">{formatMessageTime(message.createdAt)}</span>
                  </p>
                ) : null}
                <p className={`whitespace-pre-wrap break-words text-sm ${message.deleted ? "italic text-slate-400" : "text-slate-900"}`}>
                  {message.deleted ? "Mensaje eliminado" : message.content}
                </p>
              </div>
              {!message.deleted ? (
                <div className="opacity-0 group-hover:opacity-100">
                  <MessageMenu
                    isOwn={isOwn}
                    onDelete={() => onDelete(message.id)}
                    onReport={() => router.push(`/reportar/${message.author.userId}?context=CHAT&messageId=${message.id}`)}
                    onBlock={() => onBlock(message.author.userId)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
