"use client";

import type { AliasProfileDto } from "@sala/contracts";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { AchievementSummary } from "@/features/badges/AchievementCollection";
import { GardenScene } from "@/features/garden/GardenScene";
import { AdminProfileDetails } from "./AdminProfileDetails";
import { FriendAction } from "@/features/friends/FriendAction";

export function AliasProfileView({ alias }: { alias: string }) {
  const [data, setData] = useState<AliasProfileDto | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<AliasProfileDto>(`/api/v1/aliases/${encodeURIComponent(alias)}/profile`, { signal: controller.signal })
      .then(dto => { if (!controller.signal.aborted) setData(dto); })
      .catch(error => { if (!controller.signal.aborted) { setNeedsLogin(error instanceof ApiRequestError && error.status === 401); setError(error instanceof ApiRequestError && error.status === 401 ? "Iniciá sesión para visitar este perfil." : "Este perfil no está disponible."); } });
    return () => controller.abort();
  }, [alias]);
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-6"><BackButton fallbackHref="/ranking" label="Volver al ranking" showLabel/>
    {error ? <section className="mt-5 rounded-3xl border border-app bg-surface p-6"><p role="status">{error}</p>{needsLogin ? <Link href={`/login?next=${encodeURIComponent(`/alias/${alias}`)}`} className="mt-3 inline-flex min-h-11 items-center text-primary underline">Ingresar</Link> : null}</section> : data ? <>
      <article className="mt-5 rounded-3xl border border-app bg-surface p-5 sm:p-6"><div className="flex min-w-0 items-center gap-4"><Avatar userId={data.alias} name={data.alias} url={null} aliasAnimal={data.aliasAnimal} size={64}/><div className="min-w-0"><span className="text-xs font-semibold text-primary">PERFIL DE LA COMUNIDAD</span><h1 className="mt-1 break-words text-2xl font-bold">{data.alias}</h1></div></div><p className="mt-4 text-sm leading-relaxed text-muted">Esta persona participa con un alias. Su nombre y sus datos personales permanecen privados.</p></article>
      <div className="mt-4"><FriendAction target={{ kind: "alias", alias: data.alias }} name={data.alias}/></div>
      <section aria-label="Insignias y actividad" className="mt-4 rounded-3xl border border-app bg-surface p-5 sm:p-6"><h2 className="mb-5 text-lg font-bold">Insignias y actividad</h2><AchievementSummary data={data}/></section>
    </> : <p role="status" className="mt-6 text-sm text-muted">Cargando perfil…</p>}
    <AdminProfileDetails alias={alias}/>
    {data && !error ? <section className="mt-4 rounded-3xl border border-app bg-surface p-5 sm:p-6"><h2 className="mb-4 text-lg font-bold">Su jardín nativo</h2><GardenScene plotCount={data.garden.plotCount} landscapeSeed={data.garden.landscapeSeed} plants={data.garden.plants}/></section> : null}
  </main>;
}
