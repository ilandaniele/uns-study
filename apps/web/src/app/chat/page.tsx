"use client";

import Link from "next/link";
import { ChatComposer } from "@/features/chat/ChatComposer";
import { ChatMessageList } from "@/features/chat/ChatMessageList";
import { useBlockedUsers } from "@/features/chat/useBlockedUsers";
import { useRoomChat } from "@/features/chat/useRoomChat";
import { useSession } from "@/lib/auth-client";

/** MVP has a single study room (`principal`), which owns the one global chat (`#sala-principal`). */
const ROOM_SLUG = "principal";
const CHAT_MESSAGE_MAX_LENGTH = 500;

export default function ChatPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <main className="p-6 text-center text-slate-500">Cargando…</main>;
  }

  if (!session?.user) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <p className="text-slate-600">Iniciá sesión para usar el chat.</p>
        <Link href="/login" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
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
    <main className="mx-auto flex h-[calc(100vh-57px)] max-w-3xl flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">#sala-principal</h1>
        <p className="text-xs text-slate-500">{connected ? "En vivo" : "Reconectando…"}</p>
      </div>

      {loading ? (
        <p className="flex-1 p-6 text-center text-slate-500">Cargando chat…</p>
      ) : error ? (
        <p className="flex-1 p-6 text-center text-red-600">{error}</p>
      ) : (
        <>
          {hasMore ? (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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

      {sendError ? <p className="px-4 text-sm text-red-600">{sendError}</p> : null}
      <ChatComposer maxLength={CHAT_MESSAGE_MAX_LENGTH} onSend={send} />
    </main>
  );
}
