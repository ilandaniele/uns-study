"use client";

import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { GROUP_MAX_MEMBERS, GROUP_NAME_MAX_LENGTH, type GroupContactDto, type GroupConversationDto } from "@sala/contracts";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { DataPaths } from "@/lib/prefetch";
import { fetchCached, peekCached } from "@/lib/query-cache";
import { createGroup, groupErrorMessage } from "./group-actions";

export interface NewGroupViewProps {
  onBack: () => void;
  onCreated: (group: GroupConversationDto) => void;
  headerEnd?: ReactNode;
  titleId?: string;
}

const MAX_SELECTED = GROUP_MAX_MEMBERS - 1;

/** Widget view to name a new group and pick its members from the user's private-chat contacts. */
export function NewGroupView({ onBack, onCreated, headerEnd, titleId }: NewGroupViewProps) {
  const nameId = useId();
  const [contacts, setContacts] = useState<GroupContactDto[]>(() => peekCached<GroupContactDto[]>(DataPaths.groupContacts()) ?? []);
  const [loading, setLoading] = useState(() => peekCached(DataPaths.groupContacts()) === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCached<GroupContactDto[]>(DataPaths.groupContacts())
      .then((rows) => {
        if (cancelled) return;
        setContacts(rows);
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("No pudimos cargar tus contactos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const full = selected.size >= MAX_SELECTED;
  const canSubmit = name.trim().length > 0 && selected.size > 0 && !submitting;

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else if (next.size < MAX_SELECTED) next.add(userId);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const group = await createGroup({ name: name.trim(), memberIds: [...selected] });
      onCreated(group);
    } catch (err) {
      setSubmitError(groupErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-app bg-surface py-2.5 pl-2 pr-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          title="Volver"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-main transition-transform duration-150 ease-out hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
        >
          <CaretLeftIcon aria-hidden="true" weight="bold" size={20} />
        </button>
        <h2
          id={titleId}
          className="min-w-0 flex-1 font-display text-[17px] font-extrabold uppercase leading-none tracking-[0.01em] text-main"
        >
          Nuevo grupo
        </h2>
        {headerEnd}
      </div>

      <div className="border-b border-app px-4 py-3">
        <label htmlFor={nameId} className="mb-1 block text-xs font-semibold text-muted">
          Nombre del grupo
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, GROUP_NAME_MAX_LENGTH))}
          maxLength={GROUP_NAME_MAX_LENGTH}
          required
          autoComplete="off"
          className="min-h-11 w-full rounded-xl border border-app bg-surface px-3 py-2 text-base text-main focus:border-primary focus:ring-2 focus:ring-primary/25 sm:text-sm"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-muted">Cargando contactos…</p>
        ) : loadError ? (
          <p className="p-6 text-center text-red-600">{loadError}</p>
        ) : contacts.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">Todavía no tenés contactos: escribile por privado a alguien primero.</p>
        ) : (
          <fieldset className="min-w-0">
            <legend className="px-4 pb-1 pt-3 text-xs font-semibold text-muted">
              Personas ({selected.size}/{MAX_SELECTED})
            </legend>
            <ul className="divide-y divide-[var(--border)]">
              {contacts.map((contact) => {
                const checked = selected.has(contact.userId);
                return (
                  <li key={contact.userId}>
                    <label
                      className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] ${!checked && full ? "opacity-50" : "cursor-pointer"}`}
                    >
                      <Avatar
                        userId={contact.userId}
                        name={contact.displayName}
                        url={contact.avatarUrl}
                        aliasAnimal={contact.aliasAnimal}
                        size={36}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-main">{contact.displayName}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => toggle(contact.userId)}
                        className="h-5 w-5 shrink-0 accent-[var(--primary)]"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            {full ? <p className="px-4 py-2 text-xs text-muted">Máximo {GROUP_MAX_MEMBERS} personas por grupo.</p> : null}
          </fieldset>
        )}
      </div>

      {submitError ? (
        <p role="alert" className="px-4 pt-2 text-sm text-red-600">
          {submitError}
        </p>
      ) : null}
      <div className="border-t border-app bg-surface p-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {submitting ? "Creando…" : "Crear grupo"}
        </button>
      </div>
    </form>
  );
}
