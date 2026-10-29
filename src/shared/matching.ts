// Matching a bank payment to the rent it pays.
//
// The payer is the key, not the amount or the reference. Amounts move with
// partial payments and late fees, and references are whatever the tenant's
// bank app typed ("Enviado pela revolut", "Infos folgen"), but the account a
// tenant pays from rarely changes. So a person confirms "this IBAN, or this
// sender name, pays this lease" once, and from then on that payer paying
// exactly what the lease owes is recorded on import. Everything else (a new
// payer, a partial amount, two leases owing the same sum) is a suggestion a
// person confirms. The reference only says which month to pay first.
//
// Money is applied to the oldest open charge first, the default rule where the
// tenant did not say otherwise (§ 366 BGB in Germany), unless the reference
// names a month that is open.

import { normalizeAccount, normalizeName, tokens } from "./text";

export interface MatchCharge {
  id: number;
  lease_id: number;
  /** `YYYY-MM`. */
  period: string;
  due_date: string;
  /** What is still owed on it. */
  balance: number;
}

export interface MatchLease {
  id: number;
  /** The names of the people on the lease, as entered. */
  tenant_names: string[];
  unit_name: string | null;
}

export interface KnownPayer {
  lease_id: number;
  payer_account: string | null;
  /** Stored normalised (normalizeName). */
  payer_name: string | null;
}

export interface MatchTx {
  amount: number;
  booked_on: string;
  payer_name: string | null;
  payer_account: string | null;
  reference: string | null;
}

export interface Allocation {
  charge_id: number;
  amount: number;
}

/** Why a lease was proposed, strongest first. */
export type Evidence =
  | "known_account" // this IBAN was confirmed for the lease before
  | "known_name" // this sender name was confirmed for the lease before
  | "tenant_name" // the tenant's full name is the payer, or in the description
  | "tenant_last_name" // only the surname matches: a partner or a parent
  | "reference_unit" // the reference names the unit
  | "amount_exact" // the amount is exactly what the lease owes (one month or a few)
  | "amount_only"; // nothing but the amount points here, and only this lease owes it

export interface Proposal {
  /** auto: record it now. suggested: one lease, a person confirms. none: no single answer. */
  kind: "auto" | "suggested" | "none";
  lease_id: number | null;
  allocations: Allocation[];
  /** Money the proposal does not apply: an overpayment, or no open charge to take it. */
  unapplied: number;
  evidence: Evidence[];
  /** Leases worth offering when there is no single answer. */
  candidates: number[];
}

export interface MatchContext {
  charges: MatchCharge[];
  leases: MatchLease[];
  payers: KnownPayer[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

const WEIGHT: Record<Evidence, number> = {
  known_account: 100,
  known_name: 90,
  tenant_name: 60,
  tenant_last_name: 25,
  reference_unit: 15,
  amount_exact: 0,
  amount_only: 0,
};

// Words in unit names that say nothing about which unit: "Unit 3" is "3".
const UNIT_FILLER = new Set(["unit", "apt", "apartment", "flat", "suite", "main", "house", "home", "wohnung", "whg", "appartamento", "interno", "int", "piso", "logement"]);

// Month names in the languages rent references are written in, accents removed.
const MONTH_WORDS: Record<string, number> = {};
[
  ["january", "jan", "januar", "gennaio", "gen", "enero", "janvier", "januari"],
  ["february", "feb", "februar", "febbraio", "febrero", "fevrier", "februari"],
  ["march", "mar", "marz", "maerz", "mrz", "marzo", "mars", "maart"],
  ["april", "apr", "aprile", "abril", "avril"],
  ["may", "mai", "maggio", "mag", "mayo", "mei"],
  ["june", "jun", "juni", "giugno", "giu", "junio", "juin"],
  ["july", "jul", "juli", "luglio", "lug", "julio", "juillet"],
  ["august", "aug", "agosto", "ago", "aout", "augustus"],
  ["september", "sep", "sept", "settembre", "set", "septiembre", "setiembre", "septembre"],
  ["october", "oct", "oktober", "okt", "ottobre", "ott", "octubre", "octobre"],
  ["november", "nov", "novembre", "noviembre"],
  ["december", "dec", "dezember", "dez", "dicembre", "dic", "diciembre", "decembre"],
].forEach((words, i) => words.forEach((w) => (MONTH_WORDS[w] = i + 1)));

const pad = (n: number) => String(n).padStart(2, "0");

// Words a bank puts around the sender in a description line.
const DESCRIPTION_FILLER = new Set([
  "zelle", "venmo", "cashapp", "paypal", "cash", "app", "from", "to", "on", "ref", "reference", "payment", "pmt", "transfer",
  "xfer", "ach", "credit", "deposit", "online", "mobile", "bank", "conf", "confirmation", "id", "trn", "ppd", "web", "des",
  "indn", "co", "inc", "llc", "sepa", "gutschrift", "uberweisung", "ueberweisung", "bonifico", "da", "di", "per", "a", "favore",
  "ord", "ben", "eref", "mref", "cred", "svwz", "abwa", "kref", "received", "the", "for", "and", "de", "la", "el", "et", "rent",
  "miete", "affitto", "canone", "mese", "month", "loyer", "huur", "alquiler",
]);

/** The sender when a bank gives only a description: "ZELLE FROM MARCUS REED ON 10/01 REF PP0ABC" → "marcus reed". */
export function nameFromDescription(description: string | null): string | null {
  const words = tokens(description).filter((w) => w.length >= 2 && !/\d/.test(w) && !DESCRIPTION_FILLER.has(w) && !MONTH_WORDS[w]);
  return words.length >= 2 ? words.slice(0, 4).join(" ") : null;
}

/** The payer's name for matching: the name field, or failing that the sender in the description. */
function payerName(tx: { payer_name: string | null; reference: string | null }): string {
  return normalizeName(tx.payer_name) || normalizeName(nameFromDescription(tx.reference));
}

/** The month a reference names, as `YYYY-MM`: "Miete Oktober", "rent 10/2026", "2026-10". */
export function periodHint(reference: string | null, bookedOn: string): string | null {
  if (!reference) return null;
  let m = /\b(20\d{2})[-/.](0?[1-9]|1[0-2])\b/.exec(reference);
  if (m) return `${m[1]}-${pad(+m[2])}`;
  m = /\b(0?[1-9]|1[0-2])[-/.](20\d{2})\b/.exec(reference);
  if (m) return `${m[2]}-${pad(+m[1])}`;
  const words = tokens(reference);
  const monthWord = words.find((w) => MONTH_WORDS[w]);
  if (!monthWord) return null;
  const month = MONTH_WORDS[monthWord];
  const yearWord = words.find((w) => /^20\d{2}$/.test(w));
  if (yearWord) return `${yearWord}-${pad(month)}`;
  // No year: the latest such month no later than the month after the booking.
  const [by, bm] = bookedOn.split("-").map(Number);
  const year = month <= bm + 1 ? by : by - 1;
  return `${year}-${pad(month)}`;
}

/** A lease's open charges in the order money pays them: the named month, then oldest first. */
export function payOrder(charges: MatchCharge[], hint: string | null): MatchCharge[] {
  return [...charges].sort((a, b) => {
    if (hint && (a.period === hint) !== (b.period === hint)) return a.period === hint ? -1 : 1;
    return a.due_date.localeCompare(b.due_date) || a.id - b.id;
  });
}

/** Applies money to charges in order. */
export function allocate(amount: number, ordered: MatchCharge[]): { allocations: Allocation[]; unapplied: number } {
  let left = round2(amount);
  const allocations: Allocation[] = [];
  for (const c of ordered) {
    if (left <= 0) break;
    const take = round2(Math.min(left, c.balance));
    if (take <= 0) continue;
    allocations.push({ charge_id: c.id, amount: take });
    left = round2(left - take);
  }
  return { allocations, unapplied: Math.max(0, left) };
}

/** The allocation when the amount is exactly one charge, or exactly the first few (up to three months). */
function exactAllocation(amount: number, ordered: MatchCharge[]): Allocation[] | null {
  let sum = 0;
  for (let k = 0; k < Math.min(ordered.length, 3); k++) {
    sum = round2(sum + ordered[k].balance);
    if (same(sum, amount)) return ordered.slice(0, k + 1).map((c) => ({ charge_id: c.id, amount: c.balance }));
    if (sum > amount) break;
  }
  return null;
}

/** Proposes which lease a payment pays, and which charges it settles. */
export function propose(tx: MatchTx, ctx: MatchContext): Proposal {
  const none: Proposal = { kind: "none", lease_id: null, allocations: [], unapplied: round2(tx.amount), evidence: [], candidates: [] };
  if (!(tx.amount > 0)) return none;

  const account = normalizeAccount(tx.payer_account);
  const name = payerName(tx);
  const nameWords = new Set(tokens(tx.payer_name));
  const refWords = new Set(tokens(tx.reference));
  const hint = periodHint(tx.reference, tx.booked_on);

  const scored = ctx.leases.map((lease) => {
    const evidence: Evidence[] = [];
    const known = ctx.payers.filter((p) => p.lease_id === lease.id);
    if (account && known.some((p) => p.payer_account === account)) evidence.push("known_account");
    else if (name && known.some((p) => p.payer_name === name)) evidence.push("known_name");

    for (const full of lease.tenant_names) {
      const words = tokens(full);
      if (words.length >= 2 && (words.every((w) => nameWords.has(w)) || words.every((w) => refWords.has(w)))) {
        evidence.push("tenant_name");
        break;
      }
      const last = words[words.length - 1];
      if (last && last.length >= 3 && (nameWords.has(last) || refWords.has(last))) {
        evidence.push("tenant_last_name");
        break;
      }
    }

    const unitWords = tokens(lease.unit_name).filter((w) => !UNIT_FILLER.has(w));
    if (unitWords.length && unitWords.every((w) => refWords.has(w))) evidence.push("reference_unit");

    const ordered = payOrder(ctx.charges.filter((c) => c.lease_id === lease.id && c.balance > 0), hint);
    const exact = exactAllocation(tx.amount, ordered);
    const score = evidence.reduce((s, e) => s + WEIGHT[e], 0);
    return { lease, evidence, ordered, exact, score };
  });

  const identified = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (identified.length) {
    const top = identified[0].score;
    const tied = identified.filter((s) => s.score === top);
    const exactTied = tied.filter((s) => s.exact);
    const chosen = tied.length === 1 ? tied[0] : exactTied.length === 1 ? exactTied[0] : null;
    // A surname or a unit number alone is not enough to suggest a lease, unless the amount agrees.
    if (chosen && (chosen.score >= WEIGHT.tenant_name || chosen.exact)) {
      const known = chosen.evidence.includes("known_account") || chosen.evidence.includes("known_name");
      const evidence: Evidence[] = chosen.exact ? [...chosen.evidence, "amount_exact"] : chosen.evidence;
      if (known && chosen.exact && tied.length === 1) {
        return { kind: "auto", lease_id: chosen.lease.id, allocations: chosen.exact, unapplied: 0, evidence, candidates: [chosen.lease.id] };
      }
      const { allocations, unapplied } = chosen.exact
        ? { allocations: chosen.exact, unapplied: 0 }
        : allocate(tx.amount, chosen.ordered);
      return { kind: "suggested", lease_id: chosen.lease.id, allocations, unapplied, evidence, candidates: [chosen.lease.id] };
    }
    return { ...none, candidates: identified.slice(0, 5).map((s) => s.lease.id) };
  }

  const owing = scored.filter((s) => s.exact);
  if (owing.length === 1) {
    return {
      kind: "suggested",
      lease_id: owing[0].lease.id,
      allocations: owing[0].exact!,
      unapplied: 0,
      evidence: ["amount_only"],
      candidates: [owing[0].lease.id],
    };
  }
  return { ...none, candidates: owing.slice(0, 5).map((s) => s.lease.id) };
}

/** How a payer is remembered for a lease once a person confirms a match. */
export function payerKey(tx: { payer_name: string | null; payer_account: string | null; reference: string | null }): { payer_account: string | null; payer_name: string | null } | null {
  const payer_account = normalizeAccount(tx.payer_account);
  const payer_name = payerName(tx) || null;
  if (!payer_account && !payer_name) return null;
  return { payer_account, payer_name };
}
