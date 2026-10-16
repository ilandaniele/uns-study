"use client";

import { USER_EXAMS_MAX, examRequestSchema, type ExamDto, type ExamsDto } from "@sala/contracts";
import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { isProRequired } from "@/features/pro/pro-api";
import { ProBadge } from "@/features/subscriptions/ProBadge";
import { openProUpsell } from "@/features/subscriptions/pro-upsell-store";
import { usePro } from "@/features/subscriptions/usePro";
import { describeActionError } from "@/lib/errors";
import { createExam, deleteExam, getExams, updateExam } from "./exams-api";
import { countdownLabel, examProgress, formatExamDate, planLabel, progressLabel } from "./exams-view";

const inputClass = "w-full rounded-control border border-app bg-surface px-3 py-2 text-base text-main sm:text-sm";
const buttonClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-control border border-app px-4 text-sm font-semibold text-main hover:bg-surface-2 disabled:opacity-50";

interface Draft {
  id: string | null;
  subject: string;
  examDate: string;
  targetHours: string;
}

const EMPTY_DRAFT: Draft = { id: null, subject: "", examDate: "", targetHours: "20" };

function ExamForm({ draft, busy, error, onChange, onSubmit, onCancel }: {
  draft: Draft;
  busy: boolean;
  error: string | null;
  onChange: (draft: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3 rounded-control border border-app p-3">
      <label className="block text-sm font-medium text-main">
        Materia
        <input
          value={draft.subject}
          onChange={(e) => onChange({ ...draft, subject: e.target.value })}
          maxLength={80}
          required
          placeholder="Ej: Análisis Matemático II"
          className={`${inputClass} mt-1`}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-main">
          Fecha del examen
          <input
            type="date"
            value={draft.examDate}
            onChange={(e) => onChange({ ...draft, examDate: e.target.value })}
            required
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block text-sm font-medium text-main">
          Horas de estudio objetivo
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={draft.targetHours}
            onChange={(e) => onChange({ ...draft, targetHours: e.target.value })}
            required
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={buttonClass}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ExamCard({ exam, onEdit, onDelete, busy }: { exam: ExamDto; onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const past = exam.daysLeft < 0;
  const plan = planLabel(exam);
  const progress = examProgress(exam);
  return (
    <li className={`rounded-control border border-app p-3 ${past ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-main">{exam.subject}</p>
          <p className="text-xs text-muted">{formatExamDate(exam.examDate)}</p>
        </div>
        <span className={`shrink-0 font-mono text-sm font-semibold ${past ? "text-muted" : "text-primary"}`}>{countdownLabel(exam.daysLeft)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Progreso de ${exam.subject}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="mt-3 h-2 overflow-hidden rounded-control bg-[var(--surface-2)]"
      >
        <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{progressLabel(exam)}</p>
      {plan ? <p className="mt-1 text-sm text-main">{plan}</p> : null}
      {!past && !plan ? <p className="mt-1 text-sm text-main">Ya llegaste a tu objetivo de horas.</p> : null}
      <div className="mt-2 flex gap-2">
        {!past ? (
          <button type="button" onClick={onEdit} disabled={busy} className={buttonClass}>
            <PencilSimpleIcon size={16} aria-hidden="true" />
            Editar
          </button>
        ) : null}
        <button type="button" onClick={onDelete} disabled={busy} className={buttonClass}>
          <TrashIcon size={16} aria-hidden="true" />
          Borrar
        </button>
      </div>
    </li>
  );
}

/** Pro: exam planner on the profile (countdown, daily study plan, progress against target hours). */
export function ExamsSection() {
  const { lock } = usePro();
  const [data, setData] = useState<ExamsDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getExams());
      setLoadError(null);
    } catch (err) {
      if (!isProRequired(err)) setLoadError("No pudimos cargar tus exámenes.");
    }
  }, []);

  useEffect(() => {
    if (lock !== "unlocked") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; load() sets state once it resolves
    void load();
  }, [lock, load]);

  if (lock === "unknown") return null;

  if (lock === "locked") {
    return (
      <div className="mb-6">
        <h3 className="mb-1 text-sm font-semibold text-main">Plan de exámenes</h3>
        <p className="mb-2 text-xs text-muted">Cargá tus fechas de examen y mirá cuántas horas por día te faltan para llegar.</p>
        <button type="button" onClick={() => openProUpsell("exams")} className={`${buttonClass} relative`}>
          Armar mi plan
          <ProBadge />
        </button>
      </div>
    );
  }

  async function save() {
    if (!draft) return;
    const body = { subject: draft.subject.trim(), examDate: draft.examDate, targetHours: Number(draft.targetHours) };
    if (!examRequestSchema.safeParse(body).success) {
      setFormError("Revisá la materia, la fecha y las horas (entre 1 y 500).");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (draft.id) await updateExam(draft.id, body);
      else await createExam(body);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(describeActionError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(exam: ExamDto) {
    setBusy(true);
    try {
      await deleteExam(exam.id);
      await load();
    } catch (err) {
      setLoadError(describeActionError(err));
    } finally {
      setBusy(false);
    }
  }

  const exams = data?.exams ?? [];
  const full = exams.length >= USER_EXAMS_MAX;

  return (
    <div className="mb-6">
      <h3 className="mb-1 text-sm font-semibold text-main">Plan de exámenes</h3>
      {data?.career ? <p className="mb-2 text-xs text-muted">Carrera: {data.career}</p> : null}
      <p className="mb-2 text-xs text-muted">Contamos las horas que estudiás desde que cargás cada examen.</p>
      {loadError ? (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {loadError}
        </p>
      ) : null}
      {data && exams.length === 0 && !draft ? <p className="mb-2 text-sm text-muted">Todavía no cargaste ningún examen.</p> : null}
      {exams.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-3">
          {exams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              busy={busy}
              onEdit={() => {
                setFormError(null);
                setDraft({ id: exam.id, subject: exam.subject, examDate: exam.examDate, targetHours: String(exam.targetHours) });
              }}
              onDelete={() => void remove(exam)}
            />
          ))}
        </ul>
      ) : null}
      {draft ? (
        <ExamForm draft={draft} busy={busy} error={formError} onChange={setDraft} onSubmit={() => void save()} onCancel={() => setDraft(null)} />
      ) : (
        <>
          <button
            type="button"
            disabled={full || !data}
            onClick={() => {
              setFormError(null);
              setDraft(EMPTY_DRAFT);
            }}
            className={buttonClass}
          >
            <PlusIcon size={16} aria-hidden="true" />
            Agregar examen
          </button>
          {full ? <p className="mt-1 text-xs text-muted">Llegaste al máximo de {USER_EXAMS_MAX} exámenes. Borrá uno para agregar otro.</p> : null}
        </>
      )}
    </div>
  );
}
