/**
 * Profanity/abuse filter for table nicknames. Deliberately conservative — this catches obvious
 * abuse, not every possible slur; anything that slips through can still be removed by an admin
 * (see `TableNamesService.adminDeleteProposal` / `adminClearNickname`).
 *
 * Family-safe blocklist, kept minimal in comments: common Rioplatense insults/slurs (boludo,
 * pelotudo, forro, gil, concha, pija, verga, orto, puto/puta, trolo, mogólico, "negro de mierda"),
 * plus hate symbols (nazi, hitler) and a few older entries already in place.
 */
const PROFANITY_BLOCKLIST = [
  "puta",
  "puto",
  "putos",
  "putas",
  "mierda",
  "pelotudo",
  "pelotuda",
  "boludo",
  "boluda",
  "forro",
  "forra",
  "gil",
  "gila",
  "conchudo",
  "concha",
  "pendejo",
  "pendeja",
  "cornudo",
  "trolo",
  "trola",
  "negro de mierda",
  "verga",
  "pija",
  "orto",
  "cagon",
  "mogolico",
  "nazi",
  "hitler",
];

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Lowercases, strips accents, un-leets common substitutions, and collapses repeated letters —
 *  so "P3L0TUD000" and "pélotúúdo" both normalize to something the blocklist can match. */
export function normalizeForProfanityCheck(input: string): string {
  const lowered = input.toLowerCase();
  const deLeeted = lowered.replace(/[013457@$]/g, (ch) => LEET_MAP[ch] ?? ch);
  // NFD splits accented letters into base + combining mark; stripping ̀-ͯ removes the accent.
  const unaccented = deLeeted.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return unaccented.replace(/(.)\1+/g, "$1");
}

/** True when `name` contains a blocklisted word once normalized (case/accents/leet/repeats-insensitive). */
export function containsProfanity(name: string): boolean {
  const normalized = normalizeForProfanityCheck(name);
  return PROFANITY_BLOCKLIST.some((word) => normalized.includes(normalizeForProfanityCheck(word)));
}
