"use client";

import { SocketEvents } from "@sala/contracts/events";
import type { GroupConversationDto } from "@sala/contracts";
import { useCallback, useEffect, useState } from "react";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";
import { getSocket } from "@/lib/socket";

export interface UseGroupsResult {
  groups: GroupConversationDto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Lists the caller's group chats; refetches on any group message or membership change (private `user:{id}` channel). */
export function useGroups(): UseGroupsResult {
  // A cached list renders instantly; the mount request always revalidates it.
  const [groups, setGroups] = useState<GroupConversationDto[]>(() => peekCached<GroupConversationDto[]>(DataPaths.groups()) ?? []);
  const [loading, setLoading] = useState(() => peekCached(DataPaths.groups()) === undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchCached<GroupConversationDto[]>(DataPaths.groups())
      .then((rows) => {
        setGroups(rows);
        setError(null);
      })
      .catch(() => setError("No pudimos cargar tus grupos."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onChange = () => load();
    socket.on(SocketEvents.GroupMessageCreated, onChange);
    socket.on(SocketEvents.GroupUpdated, onChange);
    return () => {
      socket.off(SocketEvents.GroupMessageCreated, onChange);
      socket.off(SocketEvents.GroupUpdated, onChange);
    };
  }, [load]);

  return { groups, loading, error, refetch: load };
}
