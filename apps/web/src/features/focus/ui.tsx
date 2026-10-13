import { MinusIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, type ReactNode } from "react";

export function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-app pt-4">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
        <h2 className="t-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left"
    >
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-main">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-primary" : "bg-[var(--border-strong)]"}`}
      >
        <span
          className={`focus-ease absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}

export function Stepper({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n)) onChange(n);
    setDraft(null);
  };
  const btn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-[transform,background-color] duration-150 hover:bg-[var(--surface-2)] hover:text-main active:scale-[0.94] disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-main">{label}</span>
      <div className="flex items-center rounded-xl border border-app">
        <button type="button" className={btn} aria-label={`Menos ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <MinusIcon size={16} aria-hidden="true" />
        </button>
        <label className="flex items-baseline gap-0.5">
          <span className="sr-only">{label}</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft ?? String(value)}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onFocus={(e) => e.target.select()}
            className="w-9 bg-transparent text-center font-mono text-base font-semibold text-main outline-none"
          />
          {unit ? <span className="text-xs text-muted">{unit}</span> : null}
        </label>
        <button type="button" className={btn} aria-label={`Más ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <PlusIcon size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
