"use client";

import { SocketEvents } from "@sala/contracts/events";
import { groupSendSchema } from "@sala/contracts";
import type { GroupMessageDto, Page } from "@sala/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";
import { getSocket } from "@/lib/socket";
import { mergeMessages } from "./grouping";

export interface UseGroupThreadResult {
  /** Ascending (oldest first). */
  messages: GroupMessageDto[];
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

/** Loads + paginates a group thread and keeps it live via `group:message-created`; marks it read on load and on new messages. */
export function useGroupThread(groupId: string, options?: { onRead?: () => void }): UseGroupThreadResult {
  const onReadRef = useRef(options?.onRead);
  useEffect(() => {
    onReadRef.current = options?.onRead;
  });
  const threadPath = DataPaths.groupThread(groupId);
  // A cached/prefetched first page renders instantly; the request below always revalidates it.
  const [initial] = useState(() => peekCached<Page<GroupMessageDto>>(threadPath));
  const [messages, setMessages] = useState<GroupMessageDto[]>(() => (initial ? [...initial.items].reverse() : []));
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const markRead = useCallback(() => {
    void apiPost(`/api/v1/groups/${groupId}/read`)
      .then(() => onReadRef.current?.())
      .catch(() => {
        // best-effort; unread counts will just settle on the next successful call
      });
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    // maxAge 0: an old page is only for the instant first paint; a prefetch still in flight is shared.
    fetchCached<Page<GroupMessageDto>>(threadPath)
      .then((page) => {
        if (cancelled) return;
        // Merge rather than replace: keeps realtime messages that arrived while this page was loading.
        setMessages((prev) => mergeMessages(prev, page.items));
        setNextCursor(page.nextCursor);
        setError(null);
        markRead();
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError && err.code === "NOT_FOUND"
            ? "Este grupo ya no existe o saliste de él."
            : "No pudimos cargar la conversación.",
        );
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
    apiFetch<Page<GroupMessageDto>>(`/api/v1/groups/${groupId}/messages?cursor=${encodeURIComponent(nextCursor)}`)
      .then((page) => {
        setMessages((prev) => [...[...page.items].reverse(), ...prev]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => setLoadMoreError("No pudimos cargar mensajes anteriores."))
      .finally(() => setLoadingMore(false));
  }, [groupId, nextCursor, loadingMore]);

  useEffect(() => {
    const socket = getSocket();
    const onGroupMessage = (message: GroupMessageDto) => {
      if (message.groupId !== groupId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      markRead();
    };
    socket.on(SocketEvents.GroupMessageCreated, onGroupMessage);
    return () => {
      socket.off(SocketEvents.GroupMessageCreated, onGroupMessage);
    };
  }, [groupId, markRead]);

  const send = useCallback(
    async (content: string) => {
      setSendError(null);
      try {
        const dto = await apiPost<GroupMessageDto>(`/api/v1/groups/${groupId}/messages`, { content }, groupSendSchema);
        setMessages((prev) => (prev.some((m) => m.id === dto.id) ? prev : [...prev, dto]));
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "NOT_FOUND") {
          setSendError("Este grupo ya no existe o saliste de él.");
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
    [groupId],
  );

  return { messages, loading, loadingMore, hasMore: nextCursor !== null, error, loadMoreError, sendError, reload, loadMore, send };
}
