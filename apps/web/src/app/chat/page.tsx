"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChatComposer } from "@/features/chat/ChatComposer";
import { ChatMessageList } from "@/features/chat/ChatMessageList";
import { IdentityHelp } from "@/features/chat/IdentityHelp";
import { useBlockedUsers } from "@/features/chat/useBlockedUsers";
import { useRoomChat } from "@/features/chat/useRoomChat";
import { useSession } from "@/lib/auth-client";
import { prefetchHandlers, prefetchWhenIdle } from "@/lib/prefetch";

/** MVP has a single study room (`principal`), which owns the one global chat (`#sala-principal`). */
const ROOM_SLUG = "principal";
const CHAT_MESSAGE_MAX_LENGTH = 500;

export default function ChatPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <main className="p-6 text-center text-muted">Cargando…</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-muted">Iniciá sesión para usar el chat.</p>
        <Link
          href="/login"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Iniciar sesión
        </Link>
      </main>
    );
  }

  return <ChatRoom currentUserId={session.user.id} />;
}

function ChatRoom({ currentUserId }: { currentUserId: string }) {
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
  } = useRoomChat(ROOM_SLUG, blockedIds);

  // Private messages are the usual next stop from the room chat.
  useEffect(() => prefetchWhenIdle(["/chat/dm"]), []);

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-6 lg:px-4">
      <main className="flex h-[calc(100dvh_-_57px_-_56px_-_env(safe-area-inset-bottom))] min-w-0 flex-1 flex-col lg:h-[calc(100dvh_-_57px)]">
        <div className="flex items-center justify-between gap-3 border-b border-app bg-surface px-4 py-3">
          <div>
            <h1 className="font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.01em] text-main">
              # Sala de Estudio
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-[var(--seat-free)]" : "bg-muted"}`}
                aria-hidden="true"
              />
              {connected ? "En vivo" : everConnected ? "Reconectando…" : "Conectando…"}
            </p>
          </div>
          <Link
            href="/chat/dm"
            {...prefetchHandlers("/chat/dm")}
            className="rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
          >
            Mensajes privados
          </Link>
        </div>
        <div className="lg:hidden">
          <IdentityHelp />
        </div>
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

        {sendError ? (
          <p className="px-4 text-sm text-red-600 dark:text-red-400">
            {sendError}
          </p>
        ) : null}
        <ChatComposer maxLength={CHAT_MESSAGE_MAX_LENGTH} onSend={send} />
      </main>
      <aside className="hidden w-80 shrink-0 pt-4 lg:block">
        <IdentityHelp variant="sidebar" />
      </aside>
    </div>
  );
}
