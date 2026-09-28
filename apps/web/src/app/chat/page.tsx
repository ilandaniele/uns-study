"use client";

import Link from "next/link";
import { ChatComposer } from "@/features/chat/ChatComposer";
import { ChatMessageList } from "@/features/chat/ChatMessageList";
import { IdentityHelp } from "@/features/chat/IdentityHelp";
import { useBlockedUsers } from "@/features/chat/useBlockedUsers";
import { useRoomChat } from "@/features/chat/useRoomChat";
import { useSession } from "@/lib/auth-client";

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
        <Link href="/login" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
          Iniciar sesión
        </Link>
      </main>
    );
  }

  return <ChatRoom currentUserId={session.user.id} />;
}

function ChatRoom({ currentUserId }: { currentUserId: string }) {
  const { blockedIds, block } = useBlockedUsers();
  const { messages, loading, loadingMore, hasMore, error, sendError, connected, loadMore, send, remove } = useRoomChat(
    ROOM_SLUG,
    blockedIds,
  );

  return (
    <main className="mx-auto flex h-[calc(100dvh_-_57px_-_56px_-_env(safe-area-inset-bottom))] max-w-3xl flex-col lg:h-[calc(100dvh_-_57px)]">
      <div className="flex items-center justify-between gap-3 border-b border-app bg-surface px-4 py-3">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight text-main">Chat de la sala</h1>
          <p className="text-xs text-muted">Para todas las personas con sesión iniciada</p>
        </div>
        <Link href="/chat/dm" className="rounded-full border border-app px-3 py-1.5 text-sm font-medium text-main hover:bg-[var(--surface-2)]">
          Mensajes privados
        </Link>
      </div>
      <p className="sr-only" aria-live="polite">{connected ? "Conectado" : "Reconectando"}</p>
      {!connected ? <p className="bg-[var(--surface-2)] px-4 py-1 text-center text-xs text-muted">Reconectando…</p> : null}

      {loading ? (
        <p className="flex-1 p-6 text-center text-muted">Cargando chat…</p>
      ) : error ? (
        <p className="flex-1 p-6 text-center text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <>
          {hasMore ? (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full border border-app px-3 py-1.5 text-xs font-semibold text-muted hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                {loadingMore ? "Cargando…" : "Cargar anteriores"}
              </button>
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
      <IdentityHelp />
      <ChatComposer maxLength={CHAT_MESSAGE_MAX_LENGTH} onSend={send} />
    </main>
  );
}
