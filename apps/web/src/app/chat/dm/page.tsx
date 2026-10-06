"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { ConversationList } from "@/features/chat/ConversationList";
import { useConversations } from "@/features/chat/useConversations";
import { useSession } from "@/lib/auth-client";
import { prefetchWhenIdle } from "@/lib/prefetch";

/** Threads warmed in the background once the list loads (unread ones first). */
const IDLE_PREFETCH_THREADS = 3;

export default function ConversationsPage() {
  const { data: session, isPending } = useSession();
  const { conversations, loading, error } = useConversations();

  const topThreads = [...conversations]
    .sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0))
    .slice(0, IDLE_PREFETCH_THREADS)
    .map((c) => `/chat/dm/${c.id}`)
    .join(" ");
  useEffect(() => {
    if (topThreads) prefetchWhenIdle(topThreads.split(" "));
  }, [topThreads]);

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

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
      <div className="flex items-center gap-1">
        <BackButton fallbackHref="/chat" />
        <h1 className="font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.01em] text-main">Mensajes</h1>
      </div>

      <ConversationList conversations={conversations} loading={loading} error={error} />
    </main>
  );
}
