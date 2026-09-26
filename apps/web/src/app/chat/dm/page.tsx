"use client";

import Link from "next/link";
import { useConversations } from "@/features/chat/useConversations";
import { useSession } from "@/lib/auth-client";

export default function ConversationsPage() {
  const { data: session, isPending } = useSession();
  const { conversations, loading, error } = useConversations();

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

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-2 p-4">
      <h1 className="text-lg font-bold text-slate-900">Mensajes</h1>

      {loading ? (
        <p className="p-6 text-center text-slate-500">Cargando conversaciones…</p>
      ) : error ? (
        <p className="p-6 text-center text-red-600">{error}</p>
      ) : conversations.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          Todavía no tenés conversaciones. Escribile a alguien desde su perfil.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/chat/dm/${conversation.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{conversation.otherUser.displayName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {conversation.lastMessage?.deleted
                      ? "Mensaje eliminado"
                      : conversation.lastMessage?.content ?? "Sin mensajes todavía"}
                  </p>
                </div>
                {conversation.unread > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-white">
                    {conversation.unread}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
