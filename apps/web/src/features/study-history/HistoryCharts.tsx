import type { StudyHistoryDto } from "@sala/contracts";

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface BarsProps {
  values: number[];
  labels: (i: number) => string;
  /** Short text under each bar; an empty string hides it. */
  tick: (i: number) => string;
  title: string;
  highlight?: number | null;
}

/** Plain CSS bars: height is relative to the largest value in the series. */
function Bars({ values, labels, tick, title, highlight = null }: BarsProps) {
  const max = Math.max(1, ...values);
  return (
    <ol className="flex h-28 items-end gap-px" aria-label={title}>
      {values.map((v, i) => (
        <li key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" aria-label={`${labels(i)}: ${formatMinutes(v)}`}>
          <div className="relative w-full flex-1 overflow-hidden rounded-sm bg-[var(--surface-2)]">
            <div
              className={`absolute inset-x-0 bottom-0 ${highlight === i ? "bg-primary" : "bg-[color-mix(in_srgb,var(--primary)_55%,var(--surface-2))]"}`}
              style={{ height: `${(v / max) * 100}%` }}
            />
          </div>
          <span aria-hidden="true" className="h-3 whitespace-nowrap text-[10px] leading-3 text-muted">
            {tick(i)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-4">
      <h3 className="mb-2 text-sm font-semibold text-main">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-xl font-semibold text-main">{value}</dd>
    </div>
  );
}

function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}/${Number(m)}`;
}

const dayWord = (n: number) => (n === 1 ? "día" : "días");

export function HistoryCharts({ history }: { history: StudyHistoryDto }) {
  const { byDay, byWeekday, byHour, bestHour, streak } = history;
  // Label every fifth (or fifteenth) day, counting back from today, so the bars stay readable.
  const step = byDay.length > 30 ? 15 : 5;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={formatMinutes(history.totalMinutes)} />
        <Stat label="Días con estudio" value={`${history.activeDays} de ${history.days}`} />
        <Stat label="Racha actual" value={`${streak.current} ${dayWord(streak.current)}`} />
        <Stat label="Mejor racha" value={`${streak.longest} ${dayWord(streak.longest)}`} />
      </dl>
      <p className="mt-3 text-sm text-muted">
        {bestHour === null ? "Todavía no hay datos para saber a qué hora rendís más." : `Rendís más cerca de las ${bestHour} h.`}
        {streak.frozenDates.length > 0 ? ` Días congelados: ${streak.frozenDates.map(shortDate).join(", ")}.` : ""}
      </p>

      <ChartBlock title="Minutos por día">
        <Bars
          values={byDay.map((d) => d.minutes)}
          labels={(i) => shortDate(byDay[i]!.date)}
          tick={(i) => ((byDay.length - 1 - i) % step === 0 ? shortDate(byDay[i]!.date) : "")}
          title="Minutos de estudio por día"
          highlight={byDay.length - 1}
        />
      </ChartBlock>

      <ChartBlock title="Por día de la semana">
        <Bars values={byWeekday} labels={(i) => WEEKDAY_LABELS[i]!} tick={(i) => WEEKDAY_LABELS[i]!} title="Minutos de estudio por día de la semana" />
      </ChartBlock>

      <ChartBlock title="Por hora del día">
        <Bars
          values={byHour}
          labels={(i) => `${i} h`}
          tick={(i) => (i % 6 === 0 ? String(i) : "")}
          title="Minutos de estudio por hora del día"
          highlight={bestHour}
        />
      </ChartBlock>
    </div>
  );
}
