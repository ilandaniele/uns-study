"use client";

import { createConversationSchema, type ConversationDto } from "@sala/contracts";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost, ApiRequestError } from "@/lib/api";

/** Starts (or reopens) a direct conversation with the identified occupant of a seat. */
export function MessageOccupantButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const conversation = await apiPost<ConversationDto>("/api/v1/conversations", { userId }, createConversationSchema);
      router.push(`/chat/dm/${conversation.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "DM_NOT_ALLOWED") setError("Esta persona no acepta mensajes directos.");
      else if (err instanceof ApiRequestError && err.code === "BLOCKED") setError("No podés enviarle mensajes a esta persona.");
      else setError("No pudimos abrir la conversación.");
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
