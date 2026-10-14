"use client";

import { SocketEvents } from "@sala/contracts/events";
import { chatMessageSchema } from "@sala/contracts";
import type { ChatHistoryDto, ChatMessageDto, Page } from "@sala/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";
import { getSocket, joinChat, leaveChat } from "@/lib/socket";
import { mergeMessages } from "./grouping";

export interface UseRoomChatResult {
  /** Ascending (oldest first), ready to render top-to-bottom. Messages from blocked authors are already removed. */
  messages: ChatMessageDto[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Failure of the last "Cargar anteriores" request; never replaces the already-loaded list. */
  loadMoreError: string | null;
  sendError: string | null;
  connected: boolean;
  /** True once the socket has connected at least once (before that the UI says "Conectando…"). */
  everConnected: boolean;
  reload: () => void;
  loadMore: () => void;
  send: (content: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
}

/**
 * Loads + paginates the global room chat and keeps it live via the room WebSocket.
 * `blockedIds` hides messages from authors the caller has blocked (the API only filters
 * blocked authors out of history pages, not realtime broadcasts, so this covers both).
 */
export function useRoomChat(roomSlug: string, blockedIds: Set<string>): UseRoomChatResult {
  const historyPath = DataPaths.roomChat(roomSlug);
  // A cached/prefetched first page renders instantly; the request below always revalidates it.
  const [initial] = useState(() => peekCached<ChatHistoryDto>(historyPath));
  const [messages, setMessages] = useState<ChatMessageDto[]>(() => (initial ? [...initial.items].reverse() : []));
  const [chatRoomId, setChatRoomId] = useState<string | null>(initial?.chatRoomId ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // maxAge 0: an old page is only for the instant first paint; a prefetch still in flight is shared.
    fetchCached<ChatHistoryDto>(historyPath)
      .then((page) => {
        if (cancelled) return;
        // Merge rather than replace: keeps realtime messages that arrived while this page was loading.
        setMessages((prev) => mergeMessages(prev, page.items));
        setNextCursor(page.nextCursor);
        setChatRoomId(page.chatRoomId);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar el chat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyPath, reloadKey]);

  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    apiFetch<Page<ChatMessageDto>>(`/api/v1/rooms/${roomSlug}/messages?cursor=${encodeURIComponent(nextCursor)}`)
      .then((page) => {
        setMessages((prev) => [...[...page.items].reverse(), ...prev]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => setLoadMoreError("No pudimos cargar mensajes anteriores."))
      .finally(() => setLoadingMore(false));
  }, [roomSlug, nextCursor, loadingMore]);

  // Appends unconditionally; the returned `visibleMessages` filters blocked authors out at
  // render time, so this never needs to read `blockedIds` (kept out of dependency arrays).
  const appendMessage = useCallback((message: ChatMessageDto) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  useEffect(() => {
    if (!chatRoomId) return;
    const socket = getSocket();

    const onCreated = (message: ChatMessageDto) => {
      if (message.chatRoomId !== chatRoomId) return;
      appendMessage(message);
    };
    const onDeleted = (event: { chatRoomId: string; messageId: string }) => {
      if (event.chatRoomId !== chatRoomId) return;
      setMessages((prev) => prev.map((m) => (m.id === event.messageId ? { ...m, content: null, deleted: true } : m)));
    };
    const onConnect = () => {
      setConnected(true);
      setEverConnected(true);
      joinChat(chatRoomId);
      // Messages sent between the history request and this join (or while disconnected) were
      // never broadcast to us; re-read the latest page once joined and merge it in.
      apiFetch<ChatHistoryDto>(historyPath)
        .then((page) => setMessages((prev) => mergeMessages(prev, page.items)))
        .catch(() => undefined);
    };
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(SocketEvents.ChatMessageCreated, onCreated);
    socket.on(SocketEvents.ChatMessageDeleted, onDeleted);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(SocketEvents.ChatMessageCreated, onCreated);
      socket.off(SocketEvents.ChatMessageDeleted, onDeleted);
      leaveChat(chatRoomId);
    };
  }, [chatRoomId, appendMessage, historyPath]);

  const send = useCallback(
    async (content: string) => {
      setSendError(null);
      try {
        const dto = await apiPost<ChatMessageDto>(`/api/v1/rooms/${roomSlug}/messages`, { content }, chatMessageSchema);
        setChatRoomId((prev) => prev ?? dto.chatRoomId);
        appendMessage(dto);
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "RESTRICTED") {
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
    [roomSlug, appendMessage],
  );

  const remove = useCallback(async (messageId: string) => {
    setSendError(null);
    try {
      await apiDelete(`/api/v1/messages/${messageId}`);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: null, deleted: true } : m)));
    } catch {
      setSendError("No pudimos borrar el mensaje.");
    }
  }, []);

  // Memoized so consumers can depend on the array identity (it only changes with the data).
  const visibleMessages = useMemo(
    () => messages.filter((m) => m.author.userId === null || !blockedIds.has(m.author.userId)),
    [messages, blockedIds],
  );

  return {
    messages: visibleMessages,
    loading,
    loadingMore,
    hasMore: nextCursor !== null,
    error,
    loadMoreError,
    sendError,
    connected,
    everConnected,
    reload,
    loadMore,
    send,
    remove,
  };
}
