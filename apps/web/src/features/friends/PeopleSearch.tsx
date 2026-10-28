"use client";
import { useCallback, useEffect, useState } from "react";
import type { Page, PersonSearchDto } from "@sala/contracts";
import { apiFetch } from "@/lib/api";
import { PersonCard } from "./PersonCard";
import { useFriendRefresh } from "./useFriendRefresh";

export function PeopleSearch({ query }: { query: string }) {
  const q = query.trim();
  const [revision, setRevision] = useState(0), [cursor, setCursor] = useState("0");
  const [result, setResult] = useState<{ key: string; data?: Page<PersonSearchDto>; error?: string } | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useFriendRefresh(refresh, q.length >= 2);
  const key = `${q}:${cursor}:${revision}`;
  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiFetch<Page<PersonSearchDto>>(`/api/v1/people/search?q=${encodeURIComponent(q)}&cursor=${cursor}`, { signal: controller.signal, cache: "no-store" })
        .then(data => { if (!controller.signal.aborted) setResult(current => ({ key, data: cursor !== "0" && current?.data ? { ...data, items: [...current.data.items, ...data.items.filter(p => !current.data!.items.some(old => JSON.stringify(old.target) === JSON.stringify(p.target)))] } : data })); })
        .catch(() => { if (!controller.signal.aborted) setResult({ key, error: "No pudimos buscar personas. Probá de nuevo." }); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [q, cursor, revision, key]);
  if (q.length < 2) return <p className="rounded-2xl border border-dashed border-app p-6 text-sm leading-relaxed text-muted">Escribí al menos dos letras del nombre o alias público. También podés agregar amigos desde sus perfiles.</p>;
  return <section aria-label="Resultados de personas" className="space-y-3" aria-busy={result?.key !== key}>
    {result?.key !== key ? <p role="status" className="text-sm text-muted">Buscando…</p> : null}
    {result?.error ? <div role="alert"><p>{result.error}</p><button onClick={refresh} className="min-h-11 font-semibold text-primary">Reintentar búsqueda</button></div> : null}
    {result?.data?.items.map(person => <PersonCard key={JSON.stringify(person.target)} person={person}/>)}
    {result?.data?.items.length === 0 ? <p className="rounded-2xl border border-app p-6 text-sm text-muted">No encontramos personas con ese nombre o alias público.</p> : null}
    {result?.data?.nextCursor ? <button type="button" disabled={result?.key !== key} className="min-h-11 rounded-full border border-app px-5 text-sm font-semibold" onClick={() => setCursor(result.data!.nextCursor!)}>Ver más personas</button> : null}
  </section>;
}
