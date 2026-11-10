"use client";

import { GARDEN_BIOMES, type GardenBiomeId } from "@sala/contracts";

export function GardenBiomePicker({ biome, places, pending, onChoose }: {
  biome: GardenBiomeId; places: number; pending: boolean; onChoose: (id: GardenBiomeId) => void;
}) {
  return <section aria-labelledby="garden-biomes-title" className="mt-5 rounded-2xl border border-app bg-surface p-4">
    <h3 id="garden-biomes-title" className="font-semibold">Elegí tu paisaje</h3>
    <p className="mt-1 text-xs leading-relaxed text-muted">Desbloqueás paisajes actualizando lugares de la sala. Tus colaboraciones anteriores también cuentan; repetir el mismo lugar en un día no suma.</p>
    <div className="mt-4 grid grid-cols-2 gap-2">
      {GARDEN_BIOMES.map(item => {
        const unlocked = places >= item.requiredPlaces;
        return <button key={item.id} type="button" aria-pressed={biome === item.id} disabled={pending || !unlocked} onClick={() => onChoose(item.id)} className={`min-h-24 rounded-xl border p-3 text-left text-xs transition-colors disabled:cursor-default ${biome === item.id ? "border-primary bg-primary/10" : "border-app hover:border-primary"}`}>
          <span aria-hidden="true" className={`mb-2 block h-3 rounded-full ${item.id === "pampa" ? "bg-lime-600" : item.id === "ribera" ? "bg-teal-500" : item.id === "espinal" ? "bg-amber-600" : "bg-emerald-800"}`} />
          <span className="block font-semibold">{item.name}</span>
          <span className="mt-1 block leading-relaxed text-muted">{item.description}</span>
          {!unlocked ? <span className="mt-2 block text-primary">{places}/{item.requiredPlaces} lugares actualizados<progress aria-label={`Desbloquear ${item.name}`} value={places} max={item.requiredPlaces} className="garden-progress mt-1 h-1 w-full" /></span> : <span className="mt-2 block text-primary">{biome === item.id ? "Paisaje elegido" : "Disponible"}</span>}
        </button>;
      })}
    </div>
    <p className="mt-3 text-xs text-muted">Todas las plantas pueden crecer en cualquier paisaje. Foco básico y tus beneficios Pro siguen disponibles como siempre.</p>
  </section>;
}
