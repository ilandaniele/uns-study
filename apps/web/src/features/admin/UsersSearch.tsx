"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminUserSearchResultDto } from "./types";

const DEBOUNCE_MS = 250;
const LIST_ALL_LIMIT = 500;

export function UsersSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUserSearchResultDto[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(false);
  const [appliedQuery, setAppliedQuery] = useState("");
  const requestId = useRef(0);
  const firstRun = useRef(true);

  const search = useCallback(async (term: string) => {
    const id = ++requestId.current;
    const trimmed = term.trim();
    try {
      const rows = await apiFetch<AdminUserSearchResultDto[]>(
        `/api/v1/admin/users${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ""}`,
      );
      if (id !== requestId.current) return;
      setResults(rows);
      setAppliedQuery(trimmed);
      setError(false);
    } catch {
      if (id !== requestId.current) return;
      setError(true);
    } finally {
      if (id === requestId.current) setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load runs immediately; later changes are debounced.
    const delay = firstRun.current ? 0 : DEBOUNCE_MS;
    firstRun.current = false;
    const timer = setTimeout(() => void search(q), delay);
    return () => clearTimeout(timer);
  }, [q, search]);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o email"
          className="flex-1 rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Buscar
        </button>
      </form>

      {initialLoading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <>
          {error ? <p className="text-sm text-red-600">No pudimos cargar los usuarios.</p> : null}
          <p className="text-sm text-muted">
            {!appliedQuery && results.length === LIST_ALL_LIMIT
              ? `Mostrando los ${LIST_ALL_LIMIT} más recientes`
              : `${results.length} usuarios`}
          </p>
          <div className="flex flex-col divide-y divide-[var(--border)] rounded-[14px] border border-app bg-surface">
            {results.map((user) => (
              <Link
                key={user.userId}
                href={`/admin/users/${user.userId}`}
                className="flex flex-col gap-0.5 px-4 py-3 text-sm hover:bg-[var(--surface-2)] sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-main">{user.name}</span>
                  {user.isAdmin ? (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      Admin
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-muted">{user.email ?? "sin email"}</span>
              </Link>
            ))}
            {results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">
                {appliedQuery ? "No encontramos usuarios con esa búsqueda." : "No hay usuarios."}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
