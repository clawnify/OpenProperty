// Text normalisation shared by the statement parsers and the matcher. Bank
// exports write the same person as "MARCUS REED", "Reed, Marcus" or
// "Marcus Réed", so names are compared as accent-free lowercase word sets.

/** Lowercase, accents removed, anything that is not a letter or digit becomes a space. */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words of a name or reference, normalised. */
export function tokens(s: string | null | undefined): string[] {
  const t = normalizeText(s);
  return t ? t.split(" ") : [];
}

/** A payer name as stored for matching: its words, sorted, so word order does not matter. */
export function normalizeName(s: string | null | undefined): string {
  return tokens(s).sort().join(" ");
}

/** An IBAN or account number without spaces, dashes or case: `DE89 3704 …` → `DE893704…`. */
export function normalizeAccount(s: string | null | undefined): string | null {
  if (!s) return null;
  const a = s.replace(/[\s\-./]/g, "").toUpperCase();
  return a.length >= 4 ? a : null;
}

/** An account for display: the last four characters, so a list never shows a full IBAN. */
export function maskAccount(s: string | null | undefined): string {
  if (!s) return "";
  return s.length <= 4 ? s : `…${s.slice(-4)}`;
}
