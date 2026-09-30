"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ChatComposer } from "@/features/chat/ChatComposer";
import { daySeparatorFlags, formatDaySeparator, formatMessageTime, groupMessages } from "@/features/chat/grouping";
import { MessageMenu } from "@/features/chat/MessageMenu";
import { useBlockedUsers } from "@/features/chat/useBlockedUsers";
import { useConversations } from "@/features/chat/useConversations";
import { useDmThread } from "@/features/chat/useDmThread";
import { useStickToBottom } from "@/features/chat/useStickToBottom";
import { useSession } from "@/lib/auth-client";

const DM_MESSAGE_MAX_LENGTH = 1000;

export default function DmThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <main className="p-6 text-center text-muted">Cargando…</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-muted">Iniciá sesión para usar el chat.</p>
        <Link href="/login" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
          Iniciar sesión
        </Link>
      </main>
    );
  }

  return <DmThread conversationId={conversationId} currentUserId={session.user.id} />;
}

function DmThread({ conversationId, currentUserId }: { conversationId: string; currentUserId: string }) {
  const router = useRouter();
  const { conversations } = useConversations();
  const { block } = useBlockedUsers();
  const { messages, loading, loadingMore, hasMore, error, sendError, loadMore, send } = useDmThread(conversationId);

  const conversation = conversations.find((c) => c.id === conversationId) ?? null;
  const otherUserId = conversation?.otherUser.userId ?? null;
  const grouped = groupMessages(messages.map((m) => ({ id: m.id, authorId: m.senderId, createdAt: m.createdAt })));
  const showSeparators = daySeparatorFlags(messages);
  const lastMessage = messages[messages.length - 1];
  const scrollRef = useStickToBottom<HTMLDivElement>(lastMessage?.id ?? null, lastMessage?.senderId === currentUserId);

  return (
    <main className="mx-auto flex h-[calc(100dvh_-_57px_-_56px_-_env(safe-area-inset-bottom))] max-w-2xl flex-col lg:h-[calc(100dvh_-_57px)]">
      <div className="flex items-center justify-between gap-3 border-b border-app bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {otherUserId ? (
            <Avatar
              userId={otherUserId}
              name={conversation?.otherUser.displayName ?? "?"}
              url={conversation?.otherUser.avatarUrl ?? null}
              size={36}
            />
          ) : null}
          <div className="min-w-0">
            <Link href="/chat/dm" className="text-xs text-muted hover:underline">
              ← Mensajes
            </Link>
            <h1 className="truncate font-display text-lg font-semibold text-main">
              {conversation?.otherUser.displayName ?? "Conversación"}
            </h1>
          </div>
        </div>
        {otherUserId ? (
          <MessageMenu
            isOwn={false}
            onReport={() => router.push(`/reportar/${otherUserId}?context=DM`)}
            onBlock={() => void block(otherUserId)}
          />
        ) : null}
      </div>

      {loading ? (
        <p className="flex-1 p-6 text-center text-muted">Cargando conversación…</p>
      ) : error ? (
        <p className="flex-1 p-6 text-center text-red-600">{error}</p>
      ) : (
        <div ref={scrollRef} className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {hasMore ? (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-muted hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                {loadingMore ? "Cargando…" : "Cargar anteriores"}
              </button>
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
                <div className={`flex ${isOwn ? "justify-end" : "justify-start"} ${showHeader ? "mt-2" : ""}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      isOwn ? "bg-primary/10 text-main" : "bg-[var(--surface-2)] text-main"
                    }`}
                  >
                    <p className={`whitespace-pre-wrap break-words ${message.deleted ? "italic opacity-70" : ""}`}>
                      {message.deleted ? "Mensaje eliminado" : message.content}
                    </p>
                    <p className="mt-1 text-right font-mono text-[10px] text-muted">{formatMessageTime(message.createdAt)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sendError ? <p className="px-4 text-sm text-red-600">{sendError}</p> : null}
      <ChatComposer maxLength={DM_MESSAGE_MAX_LENGTH} onSend={send} />
    </main>
  );
}
