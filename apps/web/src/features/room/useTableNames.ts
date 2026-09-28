"use client";

import { SocketEvents, type TableNamesDto, type TableNicknameChangedEvent } from "@uns/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiFetch, apiPost } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface UseTableNamesResult {
  data: TableNamesDto | null;
  loading: boolean;
  error: string | null;
  propose: (name: string) => Promise<void>;
  vote: (proposalId: string) => Promise<void>;
  unvote: (proposalId: string) => Promise<void>;
}

/** Loads a table's nickname proposals (`GET /tables/:tableId/names`) and refetches whenever this
 *  table's nickname changes over the realtime channel — proposal/vote counts otherwise only
 *  refresh on the viewer's own actions, since votes aren't broadcast individually. */
export function useTableNames(tableId: string | null): UseTableNamesResult {
  const [data, setData] = useState<TableNamesDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!tableId) {
      setData(null);
      return;
    }
    setLoading(true);
    apiFetch<TableNamesDto>(`/api/v1/tables/${tableId}/names`)
      .then((dto) => {
        setData(dto);
        setError(null);
      })
      .catch(() => setError("No pudimos cargar los nombres propuestos."))
      .finally(() => setLoading(false));
  }, [tableId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)load whenever the selected table changes
    load();
  }, [load]);

  useEffect(() => {
    if (!tableId) return;
    const socket = getSocket();
    const onNicknameChanged = (event: TableNicknameChangedEvent) => {
      if (event.tableId === tableId) load();
    };
    socket.on(SocketEvents.TableNicknameChanged, onNicknameChanged);
    return () => {
      socket.off(SocketEvents.TableNicknameChanged, onNicknameChanged);
    };
  }, [tableId, load]);

  const propose = useCallback(
    async (name: string) => {
      if (!tableId) return;
      await apiPost(`/api/v1/tables/${tableId}/names`, { name });
      load();
    },
    [tableId, load],
  );

  const vote = useCallback(
    async (proposalId: string) => {
      await apiPost(`/api/v1/names/${proposalId}/vote`);
      load();
    },
    [load],
  );

  const unvote = useCallback(
    async (proposalId: string) => {
      await apiDelete(`/api/v1/names/${proposalId}/vote`);
      load();
    },
    [load],
  );

  return { data, loading, error, propose, vote, unvote };
}
