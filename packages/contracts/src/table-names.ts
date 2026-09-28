import { z } from "zod";

/** A single proposed nickname for a table, with aggregate vote counts. Proposer identity is
 *  never exposed — only whether the viewer is the proposer (`mine`). */
export interface TableNameProposalDto {
  id: string;
  name: string;
  votes: number;
  /** True when the current viewer voted for this proposal. */
  myVote: boolean;
  /** True when the current viewer is the proposer ("propuesto por vos"). */
  mine: boolean;
  createdAt: string;
}

/** Response for `GET /tables/:tableId/names`. */
export interface TableNamesDto {
  tableId: string;
  /** The table's current community nickname, if any (same value as `TableDto.nickname`). */
  nickname: string | null;
  proposals: TableNameProposalDto[];
}

// ---- zod ----

/** 2-24 chars, trimmed; letters (incl. accents/ñ), numbers, spaces and basic punctuation only — no URLs. */
export const proposeTableNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(24, "El nombre debe tener como máximo 24 caracteres.")
    .regex(/^[\p{L}\p{N} .,'"¡!¿?-]+$/u, "Usá solo letras, números y puntuación básica."),
});
