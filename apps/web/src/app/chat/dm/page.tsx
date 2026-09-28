"use client";

import Link from "next/link";
import { Avatar } from "@/features/chat/Avatar";
import { formatMessageTime } from "@/features/chat/grouping";
import { useConversations } from "@/features/chat/useConversations";
import { useSession } from "@/lib/auth-client";

export default function ConversationsPage() {
  const { data: session, isPending } = useSession();
  const { conversations, loading, error } = useConversations();

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

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
      <h1 className="font-display text-xl font-semibold text-main">Mensajes</h1>

      {loading ? (
        <p className="p-6 text-center text-muted">Cargando conversaciones…</p>
      ) : error ? (
        <p className="p-6 text-center text-red-600">{error}</p>
      ) : conversations.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">
          Todavía no tenés conversaciones. Escribile a alguien desde su perfil.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-[14px] border border-app bg-surface">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/chat/dm/${conversation.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
              >
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
                    {conversation.lastMessage?.deleted
                      ? "Mensaje eliminado"
                      : conversation.lastMessage?.content ?? "Sin mensajes todavía"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {conversation.lastMessageAt ? (
                    <span className="text-[11px] text-muted">{formatMessageTime(conversation.lastMessageAt)}</span>
                  ) : null}
                  {conversation.unread > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-mono text-xs font-semibold text-white">
                      {conversation.unread}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
