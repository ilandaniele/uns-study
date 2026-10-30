"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LeafIcon, PlantIcon, TreeIcon } from "@phosphor-icons/react/dist/ssr";
import { GARDEN_SPECIES, type PublicProfileDto, type SharedGardenDto } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { GardenScene } from "./GardenScene";
import { BackButton } from "@/components/BackButton";
import { Avatar } from "@/components/Avatar";

export function SharedGardenView({ userId }: { userId: string }) {
  const [data, setData] = useState<{ profile: PublicProfileDto; garden: SharedGardenDto } | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiFetch<PublicProfileDto>(`/api/v1/profiles/${encodeURIComponent(userId)}`), apiFetch<SharedGardenDto>(`/api/v1/profiles/${encodeURIComponent(userId)}/garden`)])
      .then(([profile, garden]) => { if (!cancelled) setData({ profile, garden }); })
      .catch((e: unknown) => { if (!cancelled) {
        const login = e instanceof ApiRequestError && e.status === 401;
        setNeedsLogin(login);
        setError(login ? "Iniciá sesión para visitar jardines de la sala." : "Este jardín no está disponible.");
      } });
    return () => { cancelled = true; };
  }, [userId]);
  const species = GARDEN_SPECIES.filter(s => data?.garden.plants.some(p => p.speciesId === s.id));
  const count = data?.garden.plants.length ?? 0;
  const mature = data?.garden.plants.filter(p => p.stage === "mature").length ?? 0;
  return <main className="mx-auto max-w-4xl px-4 pb-28 pt-5 sm:px-6 sm:pt-8">
    <div className="mb-5 flex items-center justify-between gap-3">
      <BackButton fallbackHref={`/u/${encodeURIComponent(userId)}`} label="Volver al perfil" showLabel matchFallback />
      <Link href="/jardin" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-app bg-surface px-4 text-sm font-semibold hover:border-primary"><PlantIcon size={18} className="text-primary" aria-hidden="true" />Mi jardín</Link>
    </div>
    {error ? <div className="mt-6 rounded-2xl border border-app bg-surface p-6"><h1 className="text-xl font-bold">No pudimos abrir este jardín</h1><p className="mt-2 text-sm text-muted" role="status">{error}</p>{needsLogin ? <Link href={`/login?next=${encodeURIComponent(`/u/${userId}/jardin`)}`} className="mt-3 inline-flex min-h-11 items-center text-primary">Ingresar a la sala</Link> : null}</div> : data ? <>
      <section className="overflow-hidden rounded-[28px] border border-app bg-surface" aria-labelledby="shared-garden-title">
        <header className="flex items-start gap-4 px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
          <Avatar userId={data.profile.userId} name={data.profile.displayName} url={data.profile.avatarUrl} size={48} />
          <div className="min-w-0">
            <p aria-hidden="true" className="t-label text-primary">El bosque de</p>
            <h1 id="shared-garden-title" className="mt-1 break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl"><span className="sr-only">El bosque de </span>{data.profile.displayName}</h1>
            <p className="mt-2 hidden text-sm leading-relaxed text-muted sm:block">Un pequeño mundo que crece con cada rato en la sala.</p>
          </div>
        </header>
        <GardenScene plotCount={data.garden.plotCount} landscapeSeed={data.garden.landscapeSeed} plants={data.garden.plants} />
        <dl className="grid grid-cols-3 border-t border-app bg-surface px-2 py-5 sm:px-7">
          {[
            { label: count === 1 ? "Planta" : "Plantas", value: count, Icon: PlantIcon },
            { label: species.length === 1 ? "Especie nativa" : "Especies nativas", value: species.length, Icon: LeafIcon },
            { label: mature === 1 ? "Adulta" : "Adultas", value: mature, Icon: TreeIcon },
          ].map(({ label, value, Icon }) => <div key={label} className="border-app flex flex-col px-2 text-center not-first:border-l">
            <dt className="order-2 mt-1 text-xs text-muted sm:text-sm">{label}</dt>
            <dd className="flex items-center justify-center gap-2 text-xl font-bold sm:text-2xl"><Icon size={18} className="text-primary" aria-hidden="true" />{value}</dd>
          </div>)}
        </dl>
      </section>
      {species.length ? <section className="mt-6 px-1" aria-label="Plantas de este jardín">
        <h2 className="text-sm font-semibold">Lo que está creciendo acá</h2>
        <ul className="mt-3 flex flex-wrap gap-2">{species.map(s => <li key={s.id} className="rounded-full border border-app bg-surface px-3 py-1.5 text-xs text-muted">{s.name}</li>)}</ul>
      </section> : null}
    </> : <div aria-busy="true" className="overflow-hidden rounded-[28px] border border-app bg-surface">
      <h1 className="sr-only">Preparando el jardín</h1>
      <div className="h-32 animate-pulse bg-surface-2" />
      <div className="aspect-[600/430] animate-pulse bg-surface" />
      <div className="h-24 animate-pulse bg-surface-2" />
    </div>}
  </main>;
}
