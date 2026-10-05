"use client";

import { SocketEvents } from "@sala/contracts/events";
import { dmSendSchema } from "@sala/contracts";
import type { DirectMessageDto, Page } from "@sala/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";
import { getSocket } from "@/lib/socket";
import { mergeMessages } from "./grouping";

export interface UseDmThreadResult {
  /** Ascending (oldest first). */
  messages: DirectMessageDto[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Failure of the last "Cargar anteriores" request; never replaces the already-loaded list. */
  loadMoreError: string | null;
  sendError: string | null;
  reload: () => void;
  loadMore: () => void;
  send: (content: string) => Promise<void>;
}

/** Loads + paginates a DM thread and keeps it live via `dm:message-created`; marks it read on load and on new messages. */
export function useDmThread(conversationId: string): UseDmThreadResult {
  const threadPath = DataPaths.dmThread(conversationId);
  // A cached/prefetched first page renders instantly; the request below always revalidates it.
  const [initial] = useState(() => peekCached<Page<DirectMessageDto>>(threadPath));
  const [messages, setMessages] = useState<DirectMessageDto[]>(() => (initial ? [...initial.items].reverse() : []));
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const markRead = useCallback(() => {
    void apiPost(`/api/v1/conversations/${conversationId}/read`).catch(() => {
      // best-effort; unread counts will just settle on the next successful call
    });
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    // maxAge 0: an old page is only for the instant first paint; a prefetch still in flight is shared.
    fetchCached<Page<DirectMessageDto>>(threadPath)
      .then((page) => {
        if (cancelled) return;
        // Merge rather than replace: keeps realtime messages that arrived while this page was loading.
        setMessages((prev) => mergeMessages(prev, page.items));
        setNextCursor(page.nextCursor);
        setError(null);
        markRead();
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar la conversación.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadPath, markRead, reloadKey]);

  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    apiFetch<Page<DirectMessageDto>>(`/api/v1/conversations/${conversationId}/messages?cursor=${encodeURIComponent(nextCursor)}`)
      .then((page) => {
        setMessages((prev) => [...[...page.items].reverse(), ...prev]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => setLoadMoreError("No pudimos cargar mensajes anteriores."))
      .finally(() => setLoadingMore(false));
  }, [conversationId, nextCursor, loadingMore]);

  useEffect(() => {
    const socket = getSocket();
    const onDm = (message: DirectMessageDto) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      markRead();
    };
    socket.on(SocketEvents.DmMessageCreated, onDm);
    return () => {
      socket.off(SocketEvents.DmMessageCreated, onDm);
    };
  }, [conversationId, markRead]);

  const send = useCallback(
    async (content: string) => {
      setSendError(null);
      try {
        const dto = await apiPost<DirectMessageDto>(`/api/v1/conversations/${conversationId}/messages`, { content }, dmSendSchema);
        setMessages((prev) => (prev.some((m) => m.id === dto.id) ? prev : [...prev, dto]));
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "BLOCKED") {
          setSendError("No podés escribirle a esta persona.");
        } else if (err instanceof ApiRequestError && err.code === "RESTRICTED") {
          setSendError("No podés enviar mensajes en este momento.");
        } else if (err instanceof ApiRequestError && err.code === "RATE_LIMITED") {
          setSendError("Demasiados mensajes seguidos. Esperá un momento.");
        } else {
          setSendError("No pudimos enviar el mensaje.");
        }
        // Composer keeps the typed text when the send rejects.
        throw err;
      }
    },
    [conversationId],
  );

  return { messages, loading, loadingMore, hasMore: nextCursor !== null, error, loadMoreError, sendError, reload, loadMore, send };
}
