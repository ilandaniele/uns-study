"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  CalendarBlankIcon,
  MagnifyingGlassIcon,
  TargetIcon,
  TimerIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Guide } from "./guides";

type Summary = Pick<Guide, "slug" | "title" | "description" | "readingMinutes">;
const ICONS = [TimerIcon, BookOpenIcon, TargetIcon, CalendarBlankIcon];
const searchable = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function GuideLibrary({ guides }: { guides: Summary[] }) {
  const [query, setQuery] = useState("");
  const filtered = guides.filter((g) =>
    searchable(`${g.title} ${g.description}`).includes(
      searchable(query.trim()),
    ),
  );
  return (
    <>
      <label className="flex min-h-12 items-center gap-3 rounded-full border border-app bg-surface px-4">
        <MagnifyingGlassIcon
          size={21}
          aria-hidden="true"
          className="text-muted"
        />
        <span className="sr-only">Buscar guía</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="¿Qué querés mejorar hoy?"
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
        />
      </label>
      <p role="status" className="sr-only">
        {filtered.length} guías encontradas
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {filtered.map((g) => {
          const Icon = ICONS[guides.indexOf(g) % ICONS.length];
          return (
            <li key={g.slug}>
              <Link
                href={`/guias/${g.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-app bg-surface p-5 transition-colors hover:border-[var(--primary)]"
              >
                <span className="garden-specimen mb-5 flex h-24 items-center justify-center rounded-xl text-primary">
                  <Icon size={42} weight="duotone" aria-hidden="true" />
                </span>
                <span className="mb-2 text-xs text-muted">
                  {g.readingMinutes} min de lectura
                </span>
                <h2 className="text-lg font-bold leading-snug group-hover:text-primary">
                  {g.title}
                </h2>
                <p className="mb-5 mt-3 text-sm leading-relaxed text-muted">
                  {g.description}
                </p>
                <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Leer guía
                  <ArrowUpRightIcon size={17} aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!filtered.length ? (
        <p className="rounded-2xl border border-app bg-surface p-6 text-sm text-muted">
          No encontramos esa guía. Probá con “Pomodoro”, “final” o “semana”.
        </p>
      ) : null}
    </>
  );
}
