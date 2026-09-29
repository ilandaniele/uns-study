"use client";

import { SocketEvents } from "@uns/contracts/events";
import type { ConversationDto, DirectMessageDto } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface UseConversationsResult {
  conversations: ConversationDto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Lists the caller's DM conversations. Authenticated sockets auto-join their private
 * `user:{userId}` channel on connect (see `RoomRealtimeGateway.handleConnection`), so no
 * explicit join is needed here to receive `dm:message-created` for any conversation.
 */
export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<ConversationDto[]>("/api/v1/conversations")
      .then((rows) => {
        setConversations(rows);
        setError(null);
      })
      .catch(() => setError("No pudimos cargar tus conversaciones."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    // A new/updated DM elsewhere can affect ordering, last message and unread counts —
    // simplest correct approach is to refetch the (small) list rather than hand-merge it.
    const onDm = (_message: DirectMessageDto) => load();
    socket.on(SocketEvents.DmMessageCreated, onDm);
    return () => {
      socket.off(SocketEvents.DmMessageCreated, onDm);
    };
  }, [load]);

  return { conversations, loading, error, refetch: load };
}
