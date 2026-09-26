"use client";

import { SocketEvents, type ChatHistoryDto, type ChatMessageDto, type Page } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiFetch, apiPost, ApiRequestError } from "@/lib/api";
import { getSocket, joinChat, leaveChat } from "@/lib/socket";

export interface UseRoomChatResult {
  /** Ascending (oldest first), ready to render top-to-bottom. Messages from blocked authors are already removed. */
  messages: ChatMessageDto[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  sendError: string | null;
  connected: boolean;
  loadMore: () => void;
  send: (content: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
}

/**
 * Loads + paginates the global room chat and keeps it live via Socket.IO.
 * `blockedIds` hides messages from authors the caller has blocked (the API only filters
 * blocked authors out of history pages, not realtime broadcasts, so this covers both).
 */
export function useRoomChat(roomSlug: string, blockedIds: Set<string>): UseRoomChatResult {
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ChatHistoryDto>(`/api/v1/rooms/${roomSlug}/messages`)
      .then((page) => {
        if (cancelled) return;
        const ascending = [...page.items].reverse();
        setMessages(ascending);
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
  }, [roomSlug]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    apiFetch<Page<ChatMessageDto>>(`/api/v1/rooms/${roomSlug}/messages?cursor=${encodeURIComponent(nextCursor)}`)
      .then((page) => {
        setMessages((prev) => [...[...page.items].reverse(), ...prev]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => setError("No pudimos cargar mensajes anteriores."))
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
      joinChat(chatRoomId);
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
  }, [chatRoomId, appendMessage]);

  const send = useCallback(
    async (content: string) => {
      setSendError(null);
      try {
        const dto = await apiPost<ChatMessageDto>(`/api/v1/rooms/${roomSlug}/messages`, { content });
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
      }
    },
    [roomSlug, appendMessage],
  );

  const remove = useCallback(async (messageId: string) => {
    await apiDelete(`/api/v1/messages/${messageId}`);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: null, deleted: true } : m)));
  }, []);

  const visibleMessages = messages.filter((m) => !blockedIds.has(m.author.userId));

  return {
    messages: visibleMessages,
    loading,
    loadingMore,
    hasMore: nextCursor !== null,
    error,
    sendError,
    connected,
    loadMore,
    send,
    remove,
  };
}
