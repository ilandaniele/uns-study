"use client";

import { useEffect, useRef } from "react";
import type { GardenPlant, GardenSpecies } from "@sala/contracts";

const observed = new Map<SVGSVGElement, boolean>();
let observer: IntersectionObserver | null = null;
function syncVisibility() {
  for (const [element, visible] of observed) element.dataset.motionVisible = String(visible && !document.hidden);
}

/** One observer for the entire garden and nursery, with no per-frame JavaScript. */
export function usePlantVisibility() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { node.dataset.motionVisible = "true"; return; }
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (observed.has(entry.target as SVGSVGElement)) observed.set(entry.target as SVGSVGElement, entry.isIntersecting);
        syncVisibility();
      }, { rootMargin: "40px" });
      document.addEventListener("visibilitychange", syncVisibility);
    }
    observed.set(node, false);
    observer.observe(node);
    return () => {
      observer?.unobserve(node);
      observed.delete(node);
      if (!observed.size) {
        observer?.disconnect();
        observer = null;
        document.removeEventListener("visibilitychange", syncVisibility);
      }
    };
  }, []);
  return ref;
}

export function plantMotion(species: GardenSpecies, stage: GardenPlant["stage"], variant: number) {
  const seed = [...species.id].reduce((n, c) => n * 31 + c.charCodeAt(0) >>> 0, variant + 1);
  const kind = species.habitat === "water" ? "floating" : species.kind === "grass" || species.habitat === "shore" ? "grass" : species.kind ?? "tree";
  const strength = kind === "grass" ? 2.2 : kind === "palm" ? 1.1 : kind === "flower" ? 1.6 : kind === "cactus" ? .3 : .65;
  return { kind, angle: strength * (stage === "seed" ? .45 : 1), duration: 7 + seed % 7, delay: -(seed % 100) / 10 };
}
