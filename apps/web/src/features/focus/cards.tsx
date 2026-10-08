import { BellIcon, BellRingingIcon, CheckIcon, FireIcon, PlusIcon, SpeakerHighIcon, SpeakerSlashIcon, TimerIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useNow } from "@/lib/use-now";
import { AMBIENT_LABEL, playChime, primeAudio, type Ambient } from "./focus-audio";
import { notifyPermission, requestNotifyPermission, showFocusNotification, type NotifyPermission } from "./focus-notify";
import { focusActions, getFocus, useFocus } from "./focus-store";
import { noopSubscribe, useMounted } from "./hooks";
import { LIMITS, PRESETS, presetIdFor, recentDays, streakDays, todayStats, type FocusSettings } from "./pomodoro";
import { Card, Stepper, Switch } from "./ui";

export function TimesCard() {
  const { settings } = useFocus();
  const set = (patch: Partial<FocusSettings>) => focusActions.setSettings(patch);
  return (
    <Card title="Tiempos">
      <div className="flex flex-col gap-2">
        <Stepper label="Foco" unit="min" value={settings.focusMin} min={LIMITS.focusMin[0]} max={LIMITS.focusMin[1]} onChange={(v) => set({ focusMin: v })} />
        <Stepper label="Pausa corta" unit="min" value={settings.shortMin} min={LIMITS.shortMin[0]} max={LIMITS.shortMin[1]} onChange={(v) => set({ shortMin: v })} />
        <Stepper label="Pausa larga" unit="min" value={settings.longMin} min={LIMITS.longMin[0]} max={LIMITS.longMin[1]} onChange={(v) => set({ longMin: v })} />
        <Stepper label="Bloques por serie" value={settings.rounds} min={LIMITS.rounds[0]} max={LIMITS.rounds[1]} onChange={(v) => set({ rounds: v })} />
      </div>
      <div className="mt-3 flex flex-col border-t border-app pt-2">
        <Switch label="Arrancar pausas solas" checked={settings.autoStartBreaks} onChange={(v) => set({ autoStartBreaks: v })} />
        <Switch label="Arrancar foco solo" hint="Después de cada pausa" checked={settings.autoStartFocus} onChange={(v) => set({ autoStartFocus: v })} />
      </div>
    </Card>
  );
}

export function PresetChips() {
  const { settings } = useFocus();
  const current = presetIdFor(settings);
  return (
    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Combinaciones rápidas">
      {PRESETS.map((p) => {
        const on = current === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => focusActions.setSettings({ focusMin: p.focusMin, shortMin: p.shortMin, longMin: p.longMin })}
            className={`min-h-11 rounded-lg border px-3.5 font-mono text-sm font-semibold transition-[transform,background-color,border-color] duration-150 active:scale-[0.97] ${
              on ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-main" : "border-app text-muted hover:bg-[var(--surface-2)] hover:text-main"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Sound ----------

const AMBIENTS: Ambient[] = ["off", "rain", "brown", "ocean", "fire"];

export function SoundCard() {
  const { ambient, volume, chime } = useFocus();
  return (
    <Card title="Sonido">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sonido de fondo">
        {AMBIENTS.map((k) => {
          const on = ambient === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => {
                primeAudio();
                focusActions.setAmbient(k);
              }}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm font-semibold transition-[transform,background-color,border-color] duration-150 active:scale-[0.97] ${
                on ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-main" : "border-app text-muted hover:bg-[var(--surface-2)] hover:text-main"
              }`}
            >
              {k === "off" ? <SpeakerSlashIcon size={16} aria-hidden="true" /> : <SpeakerHighIcon size={16} aria-hidden="true" />}
              {AMBIENT_LABEL[k]}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Suena solo mientras corre un bloque de foco.</p>
      <label className="mt-3 flex items-center gap-3">
        <span className="text-sm font-semibold text-main">Volumen</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => focusActions.setVolume(Number(e.target.value) / 100)}
          className="h-11 flex-1 accent-[var(--primary)]"
        />
        <span className="w-9 text-right font-mono text-xs text-muted">{Math.round(volume * 100)}</span>
      </label>
      <div className="mt-1 flex items-center gap-2 border-t border-app pt-2">
        <div className="flex-1">
          <Switch label="Campana al cambiar" checked={chime} onChange={(v) => focusActions.setChime(v)} />
        </div>
        <button
          type="button"
          onClick={() => {
            primeAudio();
            playChime("break", getFocus().volume || 0.6);
          }}
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-[var(--surface-2)]"
        >
          Probar
        </button>
      </div>
    </Card>
  );
}

// ---------- Notifications ----------

export function NotifyCard() {
  const initial = useSyncExternalStore<NotifyPermission | null>(noopSubscribe, notifyPermission, () => null);
  const [asked, setPerm] = useState<NotifyPermission | null>(null);
  const state = asked ?? initial;

  async function enable() {
    primeAudio();
    const p = await requestNotifyPermission();
    setPerm(p);
    if (p === "granted") void showFocusNotification("Avisos activados", "Te avisamos acá cuando termine cada bloque.");
  }

  return (
    <Card title="Avisos">
      {state === "granted" ? (
        <div className="flex items-start gap-3">
          <BellRingingIcon size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-main">
            Activados. Si estás en otra pestaña o app, te avisamos cuando termina cada bloque.
          </p>
        </div>
      ) : state === "denied" ? (
        <div className="flex items-start gap-3">
          <BellIcon size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">
            Están bloqueados. Habilitalos desde el candado de la barra de direcciones. La campana suena igual.
          </p>
        </div>
      ) : state === "unsupported" ? (
        <div className="flex items-start gap-3">
          <BellIcon size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">
            Este navegador no muestra avisos. En iPhone, agregá la app a la pantalla de inicio. La campana suena igual.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Un aviso cuando termina el foco o la pausa, aunque estés en otra pestaña.</p>
          <button
            type="button"
            onClick={enable}
            disabled={state === null}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-app bg-surface font-semibold text-main transition-[transform,background-color] duration-150 hover:bg-[var(--surface-2)] active:scale-[0.97] disabled:opacity-50"
          >
            <BellIcon size={18} aria-hidden="true" />
            Activar avisos
          </button>
        </div>
      )}
    </Card>
  );
}

// ---------- Stats ----------

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function StatsCard() {
  const mounted = useMounted();
  const { stats } = useFocus();
  const now = useNow(60_000).getTime();
  if (!mounted) {
    return (
      <Card title="Hoy">
        <div className="h-[148px]" />
      </Card>
    );
  }
  const today = todayStats(stats, now);
  const streak = streakDays(stats, now);
  const days = recentDays(stats, now, 7);
  const max = Math.max(30, ...days.map((d) => d.minutes));
  const week = days.reduce((a, d) => a + d.minutes, 0);
  return (
    <Card title="Hoy">
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-xs text-muted">Bloques</dt>
          <dd className="font-mono text-2xl font-semibold text-main">{today.sessions}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Foco</dt>
          <dd className="font-mono text-2xl font-semibold text-main">
            {today.minutes}
            <span className="ml-0.5 text-xs font-normal text-muted">min</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Racha</dt>
          <dd className="flex items-center gap-1 font-mono text-2xl font-semibold text-main">
            {streak}
            {streak > 0 ? <FireIcon size={16} weight="fill" className="text-primary" aria-hidden="true" /> : null}
            <span className="sr-only">{streak === 1 ? "día" : "días"}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-app pt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs text-muted">Últimos 7 días</span>
          <span className="font-mono text-xs text-muted">{formatMinutes(week)}</span>
        </div>
        <ol className="grid h-16 grid-cols-7 items-end gap-1.5" aria-label="Minutos de foco por día">
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            const label = d.date.toLocaleDateString("es-AR", { weekday: "long" });
            return (
              <li key={d.key} className="flex h-full flex-col items-center justify-end gap-1" aria-label={`${label}: ${d.minutes} min`}>
                <div className="relative w-full flex-1 overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
                  <div
                    className={`focus-ease absolute inset-0 origin-bottom transition-transform duration-300 ${isToday ? "bg-primary" : "bg-[color-mix(in_srgb,var(--primary)_45%,var(--surface-2))]"}`}
                    style={{ transform: `scaleY(${d.minutes / max})` }}
                  />
                </div>
                <span aria-hidden="true" className={`text-[10px] font-semibold uppercase ${isToday ? "text-main" : "text-muted"}`}>
                  {d.date.toLocaleDateString("es-AR", { weekday: "narrow" })}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

// ---------- Tasks ----------

export function TasksCard() {
  const { tasks, activeTaskId } = useFocus();
  const [text, setText] = useState("");
  const done = tasks.filter((t) => t.done).length;

  function add(e: FormEvent) {
    e.preventDefault();
    focusActions.addTask(text);
    setText("");
  }

  return (
    <Card
      title="Tareas"
      action={
        done > 0 ? (
          <button type="button" onClick={() => focusActions.clearDone()} className="min-h-8 rounded-md px-2 text-xs font-semibold text-muted hover:bg-[var(--surface-2)] hover:text-main">
            Borrar hechas ({done})
          </button>
        ) : null
      }
    >
      <form onSubmit={add} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Nueva tarea</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={120}
            placeholder="¿En qué vas a trabajar?"
            className="h-11 w-full rounded-lg border border-app bg-[var(--surface-2)] px-3 text-base text-main outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--primary)] sm:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Agregar tarea"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-[transform,opacity] duration-150 hover:bg-primary-dark active:scale-[0.94] disabled:opacity-40"
        >
          <PlusIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Anotá una tarea y elegila como actual: cada bloque terminado se le suma.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {tasks.map((t) => {
            const current = t.id === activeTaskId && !t.done;
            return (
              <li
                key={t.id}
                className={`group flex items-center gap-1 rounded-lg pl-1 ${current ? "bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--primary)]" : ""}`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={t.done ? `Marcar pendiente: ${t.text}` : `Marcar hecha: ${t.text}`}
                  onClick={() => focusActions.toggleTask(t.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-[5px] border transition-colors duration-150 ${
                      t.done ? "border-transparent bg-primary text-white" : "border-[var(--border-strong)]"
                    }`}
                  >
                    {t.done ? <CheckIcon size={12} weight="bold" aria-hidden="true" /> : null}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={t.done}
                  onClick={() => focusActions.setActiveTask(current ? null : t.id)}
                  aria-pressed={current}
                  title={current ? "Tarea actual" : "Elegir como actual"}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className={`min-w-0 flex-1 truncate text-sm ${t.done ? "text-muted line-through" : "text-main"} ${current ? "font-semibold" : ""}`}>{t.text}</span>
                  {current ? <span className="label-caps shrink-0 text-primary">Ahora</span> : null}
                  {t.pomodoros > 0 ? (
                    <span className="flex shrink-0 items-center gap-0.5 font-mono text-xs text-muted" aria-label={`${t.pomodoros} bloques`}>
                      <TimerIcon size={12} aria-hidden="true" />
                      {t.pomodoros}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => focusActions.removeTask(t.id)}
                  aria-label={`Borrar: ${t.text}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-main"
                >
                  <TrashIcon size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
