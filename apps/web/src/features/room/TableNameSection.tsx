"use client";

import { useState } from "react";
import { ThumbsUpIcon } from "@phosphor-icons/react/dist/ssr";
import { ApiRequestError } from "@/lib/api";
import { useTableNames } from "./useTableNames";

export interface TableNameSectionProps {
  tableId: string;
  /** null when the viewer is anonymous — proposing/voting requires a session. */
  loggedIn: boolean;
}

/** "Nombre de la mesa": lists nickname proposals with vote counts, lets a logged-in viewer vote
 *  (toggle) and propose a new name. Read-only for anonymous viewers. */
export function TableNameSection({ tableId, loggedIn }: TableNameSectionProps) {
  const { data, vote, unvote, propose } = useTableNames(tableId);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleVoteToggle(proposalId: string, alreadyMine: boolean) {
    setPending(true);
    setFormError(null);
    try {
      await (alreadyMine ? unvote(proposalId) : vote(proposalId));
    } catch (err) {
      // Surface the "you need to have checked in here" eligibility message; otherwise best-effort.
      if (err instanceof ApiRequestError && err.code === "TABLE_NAME_NOT_ALLOWED") {
        setFormError(err.message);
      } else {
        setFormError("No pudimos registrar tu voto.");
      }
    } finally {
      setPending(false);
    }
  }

  async function handlePropose(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      await propose(name);
      setName("");
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "No pudimos enviar tu propuesta.");
    } finally {
      setPending(false);
    }
  }

  if (!data) return null;

  return (
    <div className="border-t border-app pt-3">
      <h2 className="text-sm font-semibold text-main">Nombre de la mesa</h2>
      <p className="mt-1 text-xs text-muted">Con 5 votos o más, el más votado pasa a ser el nombre de la mesa.</p>

      {data.proposals.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {data.proposals.map((proposal) => (
            <li key={proposal.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-sm">
              <span className="min-w-0 truncate">
                {proposal.name}
                {proposal.mine ? <span className="ml-1.5 text-xs text-muted">(propuesto por vos)</span> : null}
              </span>
              <button
                type="button"
                disabled={!loggedIn || pending}
                onClick={() => handleVoteToggle(proposal.id, proposal.myVote)}
                aria-pressed={proposal.myVote}
                className="flex shrink-0 items-center gap-1 rounded-md border border-app px-2 py-1 text-xs font-semibold disabled:opacity-50"
                style={proposal.myVote ? { color: "var(--primary)", borderColor: "var(--primary)" } : undefined}
              >
                <ThumbsUpIcon aria-hidden="true" size={14} weight={proposal.myVote ? "fill" : "regular"} />
                {proposal.votes}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Todavía no hay propuestas para esta mesa.</p>
      )}

      {loggedIn ? (
        <form onSubmit={handlePropose} className="mt-2 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Proponé un nombre"
            maxLength={24}
            className="min-w-0 flex-1 rounded-lg border border-app bg-transparent px-2.5 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={pending || name.trim().length < 2}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Proponer
          </button>
        </form>
      ) : (
        <p className="mt-2 text-sm text-muted">
          <a href="/login" className="font-semibold text-primary hover:underline">
            Iniciá sesión
          </a>{" "}
          para proponer un nombre.
        </p>
      )}
      {formError ? (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {formError}
        </p>
      ) : null}
    </div>
  );
}
