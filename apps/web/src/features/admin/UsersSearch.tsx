"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminUserSearchResultDto } from "./types";

export function UsersSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUserSearchResultDto[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const rows = await apiFetch<AdminUserSearchResultDto[]>(
        `/api/v1/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`,
      );
      setResults(rows);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o email"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Buscar
        </button>
      </form>

      <div className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {results.map((user) => (
          <Link key={user.userId} href={`/admin/users/${user.userId}`} className="flex justify-between px-4 py-3 text-sm hover:bg-slate-50">
            <span className="font-medium text-slate-800">{user.name}</span>
            <span className="text-slate-500">{user.email}</span>
          </Link>
        ))}
        {results.length === 0 ? <p className="px-4 py-3 text-sm text-slate-400">Buscá un usuario por nombre o email.</p> : null}
      </div>
    </div>
  );
}
