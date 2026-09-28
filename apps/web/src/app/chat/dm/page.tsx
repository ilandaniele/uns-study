"use client";

import Link from "next/link";
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
                <PersonAvatar name={conversation.otherUser.displayName} avatarUrl={conversation.otherUser.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-main">{conversation.otherUser.displayName}</p>
                  <p className="truncate text-xs text-muted">
                    {conversation.lastMessage?.deleted
                      ? "Mensaje eliminado"
                      : conversation.lastMessage?.content ?? "Sin mensajes todavía"}
                  </p>
                </div>
                {conversation.unread > 0 ? (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-mono text-xs font-semibold text-white">
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

function PersonAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are arbitrary external HTTPS URLs, not a build-time asset
    return <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm font-semibold text-main">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
