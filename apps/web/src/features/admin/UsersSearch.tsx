"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminTag } from "@/components/AdminBadge";
import { apiFetch } from "@/lib/api";
import type { AdminUserSearchResultDto } from "./types";

const DEBOUNCE_MS = 250;
const LIST_ALL_LIMIT = 500;

export function UsersSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUserSearchResultDto[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [appliedQuery, setAppliedQuery] = useState("");
  const requestId = useRef(0);
  const firstRun = useRef(true);

  const search = useCallback(async (term: string) => {
    const id = ++requestId.current;
    const trimmed = term.trim();
    setSearching(true);
    try {
      const rows = await apiFetch<AdminUserSearchResultDto[]>(`/api/v1/admin/users${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ""}`);
      if (id !== requestId.current) return;
      setResults(rows);
      setAppliedQuery(trimmed);
      setError(false);
    } catch {
      if (id !== requestId.current) return;
      setError(true);
    } finally {
      if (id === requestId.current) {
        setInitialLoading(false);
        setSearching(false);
      }
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
          type="search"
          aria-label="Buscar usuarios"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o email"
          className="flex-1 rounded-lg border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Buscar
        </button>
      </form>

      {initialLoading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <>
          {error ? <p className="text-sm text-[var(--seat-occupied)]">No pudimos cargar los usuarios.</p> : null}
          {error && results.length === 0 ? (
            <div>
              <button
                type="button"
                onClick={() => void search(q)}
                className="rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-main hover:bg-[var(--surface-2)]"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted" aria-live="polite">
                {searching
                  ? "Buscando…"
                  : !appliedQuery && results.length === LIST_ALL_LIMIT
                    ? `Mostrando los ${LIST_ALL_LIMIT} más recientes`
                    : `${results.length} ${results.length === 1 ? "usuario" : "usuarios"}`}
              </p>
              <div
                className={`flex flex-col divide-y divide-[var(--border)] border-y border-app transition-opacity ${searching ? "opacity-60" : ""}`}
              >
                {results.map((user) => (
                  <div
                    key={user.userId}
                    className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
                  >
                    <Link href={`/u/${encodeURIComponent(user.userId)}?from=admin`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg hover:text-primary">
                      <span className="truncate font-medium text-main">{user.name}</span>
                      {user.isAdmin ? <AdminTag kind={user.isSuperAdmin ? "SUPERADMIN" : true} /> : null}
                    </Link>
                    <span className="truncate text-muted">{user.email ?? "sin email"}</span>
                    <Link href={`/admin/users/${encodeURIComponent(user.userId)}`} className="inline-flex min-h-11 items-center rounded-full border border-app px-3 font-semibold text-primary hover:bg-surface-2" aria-label={`Moderar a ${user.name}`}>Moderar</Link>
                  </div>
                ))}
                {results.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">
                    {appliedQuery ? "No encontramos usuarios con esa búsqueda." : "No hay usuarios."}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
