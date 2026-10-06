"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IdentityHelp } from "@/features/chat/IdentityHelp";
import { RoomChatPanel } from "@/features/chat/RoomChatPanel";
import { useSession } from "@/lib/auth-client";
import { prefetchWhenIdle } from "@/lib/prefetch";

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
  // Private messages are the usual next stop from the room chat.
  useEffect(() => prefetchWhenIdle(["/chat/dm"]), []);

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-6 lg:px-4">
      <main className="flex h-[calc(100dvh_-_57px_-_56px_-_env(safe-area-inset-bottom))] min-w-0 flex-1 flex-col lg:h-[calc(100dvh_-_57px)]">
        <RoomChatPanel currentUserId={currentUserId} />
      </main>
      <aside className="hidden w-80 shrink-0 pt-4 lg:block">
        <IdentityHelp variant="sidebar" />
      </aside>
    </div>
  );
}
