"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DmThread } from "@/features/chat/DmThread";
import { useConversations } from "@/features/chat/useConversations";
import { useSession } from "@/lib/auth-client";

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

  return <DmThreadScreen conversationId={conversationId} currentUserId={session.user.id} />;
}

function DmThreadScreen({ conversationId, currentUserId }: { conversationId: string; currentUserId: string }) {
  const { conversations } = useConversations();
  const conversation = conversations.find((c) => c.id === conversationId) ?? null;

  return (
    <main className="mx-auto flex h-[calc(100dvh_-_57px_-_56px_-_env(safe-area-inset-bottom))] max-w-2xl flex-col lg:h-[calc(100dvh_-_57px)]">
      <DmThread conversationId={conversationId} currentUserId={currentUserId} conversation={conversation} variant="page" />
    </main>
  );
}
