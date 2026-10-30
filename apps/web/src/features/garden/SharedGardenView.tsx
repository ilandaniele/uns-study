"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicProfileDto, SharedGardenDto } from "@sala/contracts";
import { apiFetch, ApiRequestError } from "@/lib/api";
import { GardenScene } from "./GardenScene";
import { BackButton } from "@/components/BackButton";

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
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-6">
    <BackButton fallbackHref={`/u/${encodeURIComponent(userId)}`} label="Volver al perfil" showLabel matchFallback />
    <h1 className="mt-4 text-3xl font-bold">{data ? `El bosque de ${data.profile.displayName}` : "Un rincón nativo"}</h1>
    {error ? <div className="mt-6 rounded-2xl border border-app bg-surface p-6"><p role="status">{error}</p>{needsLogin ? <Link href={`/login?next=${encodeURIComponent(`/u/${userId}/jardin`)}`} className="mt-3 inline-flex min-h-11 items-center text-primary">Ingresar a la sala</Link> : null}</div> : data ? <>
      <p className="my-4 text-sm text-muted">{data.garden.plants.length} plantas · Un jardín que crece con tiempo compartido en la sala.</p>
      <GardenScene plotCount={data.garden.plotCount} landscapeSeed={data.garden.landscapeSeed} plants={data.garden.plants} />
      <Link href="/jardin" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-white">Ir a mi jardín</Link>
    </> : <div aria-busy="true" className="mt-5 aspect-[600/430] animate-pulse rounded-3xl bg-surface-2" />}
  </main>;
}
