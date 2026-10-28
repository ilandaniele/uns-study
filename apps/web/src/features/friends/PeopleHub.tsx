"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MagnifyingGlassIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { useMe } from "@/lib/me-store";
import { usePeople } from "@/features/people/usePeople";
import { PeopleList } from "@/features/people/PeopleList";
import { FriendsPanel } from "./FriendsPanel";
import { PeopleSearch } from "./PeopleSearch";
import { useFriendRequests } from "./useFriendRequests";

type Tab = "room" | "search" | "friends" | "requests";
export function PeopleHub() {
  const { me, loading } = useMe();
  if (loading) return <main className="p-6 text-center text-muted">Cargando…</main>;
  if (!me?.user) return <main className="mx-auto max-w-lg p-8 text-center"><h1 className="text-2xl font-bold">Personas y amigos</h1><p className="mt-3 text-muted">Iniciá sesión para buscar personas y gestionar tus amistades.</p><Link href="/login?next=%2Fpersonas" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-white">Ingresar</Link></main>;
  return <Hub key={me.user.id}/>;
}

function Hub() {
  const requested = useSearchParams().get("tab");
  const tab: Tab = requested === "search" || requested === "friends" || requested === "requests" ? requested : "room";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [requestView, setRequestView] = useState<"incoming" | "outgoing">("incoming");
  const incoming = useFriendRequests();
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pt-8">
    <header className="mb-6"><p className="t-label text-primary">Conectá con la sala</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-bold"><UsersThreeIcon size={30} aria-hidden="true"/>Personas</h1><p className="mt-2 text-sm leading-relaxed text-muted">Encontrá con quién estudiar y mantené cerca a tus amigos.</p></header>
    <label className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl border border-app bg-surface px-4 focus-within:ring-2 focus-within:ring-primary/40"><MagnifyingGlassIcon size={22} className="shrink-0 text-primary" aria-hidden="true"/><span className="sr-only">{tab === "friends" ? "Buscar entre mis amigos" : tab === "requests" ? "Buscar en mis solicitudes" : "Buscar personas por nombre o alias"}</span><input type="search" autoComplete="off" maxLength={80} value={query} onChange={event => { setQuery(event.target.value); if (tab !== "friends" && tab !== "requests" && tab !== "search") router.replace("/personas?tab=search", { scroll: false }); }} placeholder="Buscá un nombre o alias" className="min-w-0 flex-1 bg-transparent py-3 text-base text-main outline-none"/></label>
    <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-app bg-surface p-1.5 sm:grid-cols-4" aria-label="Vistas de personas">
      {([["room", "En la sala"], ["search", "Buscar"], ["friends", "Amigos"], ["requests", "Solicitudes"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => { setQuery(""); router.replace(`/personas?tab=${key}`, { scroll: false }); }} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold ${tab === key ? "bg-primary text-white" : "text-muted hover:bg-surface-2"}`}>{label}{key === "requests" && incoming > 0 ? <span className="rounded-full bg-app px-1.5 py-0.5 text-xs text-primary">{incoming}</span> : null}</button>)}
    </div>
    {tab === "room" ? <RoomPeople/> : tab === "search" ? <PeopleSearch key={query.trim()} query={query}/> : tab === "friends" ? <><h2 className="mb-2 text-lg font-bold">Mis amigos</h2><p className="mb-4 text-sm text-muted">Esta lista es privada. Agregar amigos no cambia la privacidad de sus perfiles.</p><FriendsPanel key="friends" view="friends" query={query}/></> : <><div className="mb-4 flex flex-wrap gap-2"><button aria-pressed={requestView === "incoming"} onClick={() => setRequestView("incoming")} className={`min-h-11 rounded-full border border-app px-4 text-sm font-semibold ${requestView === "incoming" ? "bg-surface-2 text-primary" : "text-muted"}`}>Recibidas{incoming ? ` (${incoming})` : ""}</button><button aria-pressed={requestView === "outgoing"} onClick={() => setRequestView("outgoing")} className={`min-h-11 rounded-full border border-app px-4 text-sm font-semibold ${requestView === "outgoing" ? "bg-surface-2 text-primary" : "text-muted"}`}>Enviadas</button></div><FriendsPanel key={requestView} view={requestView} query={query}/></>}
  </main>;
}

function RoomPeople() {
  const { people, loading, error } = usePeople("principal");
  return <section aria-label="Personas en la sala"><h2 className="text-lg font-bold">En la sala ahora</h2><p className="mb-4 mt-2 text-sm text-muted">Sólo las personas que decidieron mostrarse. Tocá un perfil para conocerlo o agregarlo.</p>{loading ? <p role="status" className="text-sm text-muted">Cargando…</p> : error ? <p role="alert" className="text-sm text-red-500">{error}</p> : <PeopleList people={people}/>}</section>;
}
