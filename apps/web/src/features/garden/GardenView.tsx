"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  LeafIcon,
  PlantIcon,
  TreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  GARDEN_SIZE,
  GARDEN_SPECIES,
  type GardenSpecies,
} from "@sala/contracts";
import { useMe } from "@/lib/me-store";
import { TreeArt } from "./TreeArt";
import { useGarden } from "./useGarden";
import { SeedShop } from "./SeedShop";
import { GardenScene } from "./GardenScene";
import { GardenSharing } from "./GardenSharing";

const STAGES = {
  seed: "Recién plantado",
  sprout: "Brote",
  young: "Árbol joven",
  mature: "Adulto",
};
const hours = (minutes: number) =>
  `${Number((minutes / 60).toFixed(1)).toLocaleString("es-AR")} h`;
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-45";

export function GardenView() {
  const { me, loading } = useMe();
  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-7 sm:px-6 sm:pt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 sm:mb-7">
        <div>
          <p className="t-label hidden text-primary sm:block">Un ratito cada día</p>
          <h1 className="text-2xl font-bold tracking-tight sm:mt-2 sm:text-4xl">
            Mi bosque nativo
          </h1>
          <p className="mt-3 hidden max-w-xl text-sm leading-relaxed text-muted sm:block">
            Cada hora en la sala hace crecer tu jardín de árboles nativos
            argentinos.
          </p>
        </div>
        <Link
          href="/foco"
          className="hidden min-h-11 items-center gap-2 text-sm font-semibold text-primary sm:inline-flex"
        >
          Ir a concentrarme
          <ArrowRightIcon size={18} aria-hidden="true" />
        </Link>
      </div>
      {loading ? (
        <div
          aria-busy="true"
          className="h-96 animate-pulse rounded-2xl bg-surface-2"
        />
      ) : me?.user ? (
        <GardenAccount key={me.user.id} userId={me.user.id} />
      ) : (
        <section className="garden-welcome rounded-2xl border border-app p-6 text-center sm:p-10">
          <div className="mx-auto mb-4 h-40 w-40">
            <TreeArt species={GARDEN_SPECIES[5]} />
          </div>
          <h2 className="text-2xl font-bold">Un pequeño bosque, a tu ritmo</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            Iniciá sesión y empezá con 30 semillas de regalo. Plantá en tus 25
            parcelas y mirá cómo crecen con tus horas registradas en la sala.
          </p>
          <Link href="/login?next=/jardin" className={`${primary} mt-5`}>
            Empezar mi jardín
            <PlantIcon size={19} aria-hidden="true" />
          </Link>
        </section>
      )}
      <details className="mt-8 rounded-2xl border border-app bg-surface p-5">
        <summary className="cursor-pointer py-1 font-semibold">
          Cómo crece tu jardín
        </summary>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Recibís 30 semillas al empezar y una más por cada 6 minutos de
            presencia registrada (10 por hora). Tu historial de horas en la sala
            también cuenta para ese saldo inicial.
          </p>
          <p>
            Elegí una parcela y comprá un árbol en el vivero. Todos tus árboles
            crecen mientras acumulás tiempo con “Estoy acá” activo, hasta su
            vencimiento. El tiempo de Foco por sí solo no suma horas al jardín.
          </p>
          <p>
            Podés conservar los árboles adultos o canjearlos por semillas para
            plantar otras especies. Cada canje suma el ejemplar a tu colección y
            libera la parcela. No se marchitan si descansás.
          </p>
          <p>
            Es un jardín virtual personal. Los tiempos de crecimiento son del
            juego; las especies y regiones se basan en fuentes botánicas
            oficiales. No representa plantaciones reales ni reservas de
            asientos.
          </p>
        </div>
      </details>
    </main>
  );
}

function GardenAccount({ userId }: { userId: string }) {
  const { garden, error, pending, refresh, act } = useGarden();
  const [selected, setSelected] = useState<number | null>(null);
  const [speciesId, setSpeciesId] = useState(GARDEN_SPECIES[0].id);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLElement>(null);
  const species = GARDEN_SPECIES.find((s) => s.id === speciesId)!;
  const selectedPlant = garden?.plants.find((p) => p.plot === selected);
  const selectedSpecies = selectedPlant
    ? GARDEN_SPECIES.find((s) => s.id === selectedPlant.speciesId)!
    : species;
  function choose(plot: number) {
    setSelected(plot);
    setNotice("");
    if (window.matchMedia("(max-width: 1023px)").matches)
      panel.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }
  async function plant() {
    if (selected === null) return;
    if (await act("plant", { plot: selected, speciesId }))
      setNotice(`${species.name} plantado. ¡A darle tiempo!`);
  }
  async function redeem() {
    if (!selectedPlant || selected === null) return;
    if (await act("redeem", { plot: selected, plantId: selectedPlant.id }))
      setNotice(
        `Sumaste ${selectedSpecies.reward} semillas y un ${selectedSpecies.name.toLowerCase()} a tu colección.`,
      );
  }
  if (!garden)
    return (
      <section
        aria-busy={!error}
        className="rounded-2xl border border-app bg-surface p-6"
      >
        <p role={error ? "alert" : "status"}>
          {error ?? "Preparando tus parcelas…"}
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => void refresh()}
            className={`${primary} mt-4`}
          >
            Reintentar
          </button>
        ) : null}
      </section>
    );
  const collected = Object.values(garden.collection).reduce(
    (sum, n) => sum + n,
    0,
  );
  const mature = garden.plants.filter((p) => p.stage === "mature").length;
  return (
    <>
      <nav aria-label="Secciones del jardín" className="mb-5 flex gap-2 rounded-full border border-app bg-surface p-1"><a href="#mi-bosque" className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">Bosque</a><a href="#nursery-title" className="flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold">Vivero</a><a href="#garden-collection" className="flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold">Colección</a></nav>
      <div className="mb-5 flex flex-wrap gap-3 sm:gap-6">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-app bg-surface px-4 text-sm font-semibold">
          <LeafIcon size={19} className="text-primary" aria-hidden="true" />
          <span data-testid="garden-seeds">{garden.seeds}</span> semillas
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <TreeIcon size={19} aria-hidden="true" />
          {garden.plants.length}/{GARDEN_SIZE} parcelas
        </span>
        <span className="inline-flex items-center text-sm text-muted">
          {hours(garden.studyMinutes)} en la sala
        </span>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-label="Mi jardín: 25 parcelas"
          className="garden-landscape overflow-hidden rounded-[24px] border border-app p-3 sm:p-5"
        >
          <div className="mb-5 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="font-semibold">Mi rincón nativo</h2>
              <p className="mt-1 text-xs text-muted">
                Tocá una parcela para plantar o ver tu árbol.
              </p>
            </div>
            <PlantIcon
              size={27}
              className="shrink-0 text-primary"
              aria-hidden="true"
            />
          </div>
          <GardenScene plants={garden.plants} selected={selected} onSelect={choose} />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
            <span>
              {mature
                ? `${mature} ${mature === 1 ? "árbol adulto" : "árboles adultos"}`
                : "Crece con tu tiempo, sin apuro"}
            </span>
            <span>
              Próxima semilla: {garden.nextSeedMinutes} min de estudio
            </span>
          </div>
          <GardenSharing shared={garden.shared} userId={userId} pending={pending} onChange={shared => act("visibility", { shared })} />
        </section>
        <section
          ref={panel}
          aria-label="Parcela seleccionada"
          className="scroll-mt-24 rounded-[24px] border border-app bg-surface p-5 sm:p-6"
        >
          {selected === null ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-primary">
                <PlantIcon size={27} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-bold">
                {garden.plants.length === GARDEN_SIZE ? "Tu rincón está lleno de vida" : "Todo empieza con una semilla"}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {garden.plants.length === GARDEN_SIZE ? "Podés conservar tus árboles o elegir uno adulto para canjearlo y liberar una parcela." : "Elegí una de tus parcelas. Después buscá tu primer árbol en el vivero."}
              </p>
            </div>
          ) : (
            <>
              <p className="t-label text-muted">Parcela {selected + 1}</p>
              <div className="mx-auto my-3 h-32 w-32">
                <TreeArt
                  species={selectedSpecies}
                  stage={selectedPlant?.stage ?? "mature"}
                />
              </div>
              <h2 className="text-xl font-bold">{selectedSpecies.name}</h2>
              <p className="mt-1 text-xs italic text-muted">
                {selectedSpecies.scientificName}
              </p>
              {selectedPlant ? (
                <>
                  <p className="mt-4 text-sm font-semibold text-primary">
                    {STAGES[selectedPlant.stage]} ·{" "}
                    {Math.floor(selectedPlant.progress * 100)}%
                  </p>
                  <progress
                    className="garden-progress mt-2 h-2 w-full"
                    value={selectedPlant.progress}
                    max={1}
                    aria-label={`Crecimiento de ${selectedSpecies.name}`}
                  />
                  <p className="mt-2 text-sm text-muted">
                    {hours(
                      Math.min(
                        selectedPlant.studiedMinutes,
                        selectedSpecies.growthMinutes,
                      ),
                    )}{" "}
                    de {hours(selectedSpecies.growthMinutes)} de crecimiento.
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {selectedPlant.stage === "mature"
                      ? "Podés dejarlo en tu jardín o canjearlo y liberar la parcela."
                      : "Seguí sumando tiempo en la sala. Crece junto con los demás árboles de tu jardín."}
                  </p>
                  <button
                    type="button"
                    disabled={pending || selectedPlant.stage !== "mature"}
                    onClick={() => void redeem()}
                    className={`${primary} mt-5 w-full`}
                  >
                    {pending
                      ? "Guardando…"
                      : `Canjear por ${selectedSpecies.reward} semillas`}
                  </button>
                </>
              ) : (
                <>
                  <label
                    htmlFor="garden-species"
                    className="mt-4 block text-sm font-semibold"
                  >
                    Elegí del vivero
                  </label>
                  <select
                    id="garden-species"
                    value={speciesId}
                    onChange={(e) => setSpeciesId(e.target.value)}
                    className="mt-2 min-h-11 w-full rounded-lg border border-app bg-surface px-3 text-sm"
                  >
                    {GARDEN_SPECIES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.cost} semillas
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-sm text-muted">
                    Adulto en {hours(species.growthMinutes)} de estudio. Canje:{" "}
                    {species.reward} semillas.
                  </p>
                  <button
                    type="button"
                    onClick={() => void plant()}
                    disabled={pending || garden.seeds < species.cost}
                    className={`${primary} mt-4 w-full`}
                  >
                    {pending
                      ? "Plantando…"
                      : `Plantar · ${species.cost} semillas`}
                  </button>
                  {garden.seeds < species.cost ? (
                    <p className="mt-2 text-xs text-muted">
                      Te faltan {species.cost - garden.seeds} semillas. Podés
                      ganarlas estudiando.
                    </p>
                  ) : null}
                </>
              )}
              <p className="mt-5 border-t border-app pt-4 text-xs leading-relaxed text-muted">
                <span className="font-semibold">{selectedSpecies.region}.</span>{" "}
                {selectedSpecies.description}
              </p>
              <a
                href={selectedSpecies.source}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary underline"
              >
                Conocer la especie ↗
              </a>
            </>
          )}
          <div aria-live="polite" aria-atomic="true">
            {notice ? (
              <p
                className="mt-4 text-sm font-semibold text-primary"
                role="status"
              >
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 text-sm text-occupied" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </section>
      </div>
      <SeedShop onCredit={refresh} />
      <section aria-labelledby="nursery-title" className="mt-9">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="t-label text-primary">De acá, de Argentina</p>
            <h2
              id="nursery-title"
              className="mt-2 text-2xl font-bold tracking-tight"
            >
              El vivero nativo
            </h2>
          </div>
          <span className="text-sm text-muted">12 especies para descubrir</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {GARDEN_SPECIES.map((s) => (
            <SpeciesCard
              key={s.id}
              species={s}
              count={garden.collection[s.id] ?? 0}
              selected={s.id === speciesId}
              onChoose={() => {
                setSpeciesId(s.id);
                if (selected === null || selectedPlant)
                  setSelected(
                    Array.from({ length: GARDEN_SIZE }, (_, i) => i).find(
                      (i) => !garden.plants.some((p) => p.plot === i),
                    ) ?? null,
                  );
                panel.current?.scrollIntoView({
                  behavior: "instant",
                  block: "start",
                });
              }}
            />
          ))}
        </div>
      </section>
      <details id="garden-collection" className="mt-6 scroll-mt-24 rounded-2xl border border-app bg-surface p-5">
        <summary className="cursor-pointer py-1 font-semibold">
          Mi colección · {collected}{" "}
          {collected === 1 ? "árbol canjeado" : "árboles canjeados"}
        </summary>
        <p className="mt-3 text-sm text-muted">
          Cada árbol adulto que canjeás queda registrado acá. Los que conservás
          siguen en tus parcelas.
        </p>
        {collected ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {GARDEN_SPECIES.filter((s) => garden.collection[s.id]).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>{s.name}</span>
                <span className="font-mono text-primary">
                  ×{garden.collection[s.id]}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </>
  );
}

function SpeciesCard({
  species,
  count,
  selected,
  onChoose,
}: {
  species: GardenSpecies;
  count: number;
  selected: boolean;
  onChoose: () => void;
}) {
  return (
    <article
      className={`flex min-w-0 flex-col rounded-2xl border bg-surface p-3 sm:p-4 ${selected ? "border-[var(--primary)]" : "border-app"}`}
    >
      <div className="garden-specimen relative mb-3 flex aspect-[4/3] items-center justify-center rounded-xl">
        <div className="h-full w-24">
          <TreeArt species={species} />
        </div>
        {count ? (
          <span className="absolute right-2 top-2 rounded-full bg-surface px-2 py-1 text-[10px] font-semibold">
            ×{count}
          </span>
        ) : null}
      </div>
      <h3 className="text-sm font-bold">{species.name}</h3>
      <p className="mt-1 text-xs text-muted">{species.region}</p>
      <p className="mb-4 mt-2 text-xs text-muted">
        {hours(species.growthMinutes)} de crecimiento
      </p>
      <button
        type="button"
        onClick={onChoose}
        className="mt-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-app px-2 text-xs font-semibold text-primary hover:bg-surface-2"
      >
        <LeafIcon size={14} aria-hidden="true" />
        {species.cost} semillas
      </button>
    </article>
  );
}
