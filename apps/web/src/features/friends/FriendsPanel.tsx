"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FriendsPageDto, FriendsView } from "@sala/contracts";
import { apiFetch } from "@/lib/api";
import { PersonCard } from "./PersonCard";
import { useFriendRefresh } from "./useFriendRefresh";

export function FriendsPanel({ view, query = "" }: { view: FriendsView; query?: string }) {
  const [data, setData] = useState<FriendsPageDto | null>(null), [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const load = useCallback((cursor?: string) => {
    const request = ++sequence.current;
    void apiFetch<FriendsPageDto>(`/api/v1/me/friends?view=${view}&q=${encodeURIComponent(query)}${cursor ? `&cursor=${cursor}` : ""}`, { cache: "no-store" })
      .then(dto => { if (request === sequence.current) { setData(current => cursor && current ? { ...dto, items: [...current.items, ...dto.items.filter(item => !current.items.some(old => old.id === item.id))] } : dto); setError(""); } })
      .catch(() => { if (request === sequence.current) setError("No pudimos cargar esta lista. Probá de nuevo."); })
      .finally(() => { if (request === sequence.current) setMore(false); });
  }, [view, query]);
  const refresh = useCallback(() => load(), [load]);
  useEffect(() => { const timer = window.setTimeout(refresh, query ? 250 : 0); return () => { window.clearTimeout(timer); invalidate(); }; }, [refresh, invalidate, query]);
  useFriendRefresh(refresh);
  return <section className="space-y-3" aria-label={view === "friends" ? "Tu lista de amigos" : view === "incoming" ? "Solicitudes recibidas" : "Solicitudes enviadas"}>
    {error ? <div role="alert" className="rounded-2xl border border-app p-4"><p>{error}</p><button className="mt-2 min-h-11 text-primary" onClick={refresh}>Reintentar</button></div> : null}
    {!data && !error ? <p role="status" className="py-4 text-sm text-muted">Cargando…</p> : null}
    {data?.items.map(item => <PersonCard key={item.id} person={item.person}/>)}
    {data?.items.length === 0 ? <div className="rounded-2xl border border-dashed border-app p-7 text-center"><p className="font-semibold">{view === "friends" ? "Tu lista de amigos empieza acá" : view === "incoming" ? "No tenés solicitudes pendientes" : "No tenés solicitudes enviadas"}</p><p className="mt-2 text-sm text-muted">{view === "friends" ? "Buscá a alguien de la sala y mandale una solicitud." : "Las amistades se agregan sólo después de aceptar."}</p></div> : null}
    {data?.nextCursor ? <button type="button" disabled={more} onClick={() => { setMore(true); load(data.nextCursor!); }} className="min-h-11 rounded-full border border-app px-5 text-sm font-semibold disabled:opacity-50">{more ? "Cargando…" : "Ver más"}</button> : null}
  </section>;
}
