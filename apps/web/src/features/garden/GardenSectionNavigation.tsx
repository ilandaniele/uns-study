"use client";

import { useEffect, useRef, useState } from "react";

const SECTIONS = [{ id: "mi-bosque", label: "Bosque" }, { id: "garden-nursery", label: "Vivero" }, { id: "garden-collection", label: "Colección" }] as const;

export function GardenSectionNavigation() {
  const [active, setActive] = useState<string>("mi-bosque");
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const header = document.querySelector("body > header") ?? document.querySelector("header");
    let frame = 0;
    function measure() {
      const headerHeight = header?.getBoundingClientRect().height ?? 64;
      const navHeight = element!.getBoundingClientRect().height;
      parent!.style.setProperty("--garden-header-height", `${headerHeight + 8}px`);
      parent!.style.setProperty("--garden-section-top", `${headerHeight + navHeight + 24}px`);
      let current: string = "mi-bosque";
      for (const section of SECTIONS) {
        const top = document.getElementById(section.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= headerHeight + navHeight + 40) current = section.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) current = "garden-collection";
      setActive(current);
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    if (header) observer.observe(header);
    observer.observe(element);
    observer.observe(parent);
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);
  return <nav ref={nav} aria-label="Secciones del jardín" className="sticky top-[var(--garden-header-height,72px)] z-30 mb-5 flex gap-1 rounded-full border border-app bg-surface/95 p-1 shadow-sm backdrop-blur">
    {SECTIONS.map(section => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined} className={`flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${active === section.id ? "bg-primary text-white" : "text-muted hover:bg-surface-2"}`} onClick={event => {
      const target = document.getElementById(section.id);
      if (!target) return;
      event.preventDefault();
      if (target instanceof HTMLDetailsElement) target.open = true;
      history.replaceState(null, "", `#${section.id}`);
      setActive(section.id);
      target.scrollIntoView({ block: "start", behavior: "instant" });
    }}>{section.label}</a>)}
  </nav>;
}
