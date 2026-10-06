"use client";

import { ChatCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { conversationErrorMessage, startConversation } from "@/features/chat/start-conversation";
import { openChatWidget } from "@/features/chat/widget-store";

/** Starts (or reopens) a direct conversation with the identified occupant of a seat, in the chat widget. */
export function MessageOccupantButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const conversation = await startConversation(userId);
      openChatWidget({ view: "dm", conversationId: conversation.id, conversation });
      setBusy(false);
    } catch (err) {
      setError(conversationErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-app px-3 text-sm font-medium text-main hover:bg-[var(--surface-2)] disabled:opacity-60"
      >
        <ChatCircleIcon size={16} />
        {busy ? "Abriendo…" : "Mandar mensaje"}
      </button>
      {error ? <p className="mt-1 text-xs text-muted">{error}</p> : null}
    </div>
  );
}
