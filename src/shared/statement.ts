// Reading bank statements into one shape. Two formats:
//
// - CAMT.053, the ISO 20022 statement European banks export. Structured: the
//   payer's name and IBAN and the payment reference each have their own field.
// - CSV, which every bank exports in its own layout: semicolons or commas,
//   "1.650,00" or "1,650.00", day-first or month-first dates, a signed amount
//   or separate money-in and money-out columns, sometimes a few lines of
//   account details above the header. `guessMapping` reads the layout from the
//   header and the data, and the person confirms it before anything is saved.
//
// Both run in the browser on the file the person picks; the server receives
// only the normalised lines.

import { all, descendants, find, parseXml, textAt, type XmlNode } from "./xml";
import { normalizeAccount, normalizeText } from "./text";

export interface StatementLine {
  /** Booking date, `YYYY-MM-DD`. */
  booked_on: string;
  /** Positive is money in, negative money out. */
  amount: number;
  currency: string | null;
  /** Who sent the money (for money in). */
  payer_name: string | null;
  /** Their IBAN or account number, without spaces. */
  payer_account: string | null;
  /** The payment reference, or the bank's description of the line. */
  reference: string | null;
  /** The bank's own identifier for the line, when the format carries one. */
  bank_ref: string | null;
}

export type StatementFormat = "csv" | "camt053";

/** Bank CSVs are often Windows-1252 (German and Italian banks especially); try UTF-8 first. */
export function decodeBytes(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectFormat(text: string): StatementFormat {
  const head = text.slice(0, 2000).trimStart();
  return head.startsWith("<") && /camt\.05[234]|BkToCstmr/.test(text.slice(0, 5000)) ? "camt053" : "csv";
}

// ── CAMT.053 ───────────────────────────────────────────────────────

const num = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const v = parseFloat(s.trim());
  return Number.isFinite(v) ? v : null;
};

const isoDate = (s: string | null): string | null => {
  const d = s ? s.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/** The other side of a transaction: the debtor for money in, the creditor for money out. */
function counterparty(tx: XmlNode | undefined, incoming: boolean): { name: string | null; account: string | null } {
  const party = incoming ? "Dbtr" : "Cdtr";
  const ultimate = incoming ? "UltmtDbtr" : "UltmtCdtr";
  const name =
    textAt(tx, "RltdPties", party, "Nm") ?? // camt.053.001.02
    textAt(tx, "RltdPties", party, "Pty", "Nm") ?? // camt.053.001.08 and later
    textAt(tx, "RltdPties", ultimate, "Nm") ??
    textAt(tx, "RltdPties", ultimate, "Pty", "Nm");
  const account =
    textAt(tx, "RltdPties", `${party}Acct`, "Id", "IBAN") ?? textAt(tx, "RltdPties", `${party}Acct`, "Id", "Othr", "Id");
  return { name, account: normalizeAccount(account) };
}

/** Unstructured lines and the structured creditor reference, both: a bank puts an
 *  invalid RF reference in the unstructured field, so an importer reads both. */
function remittance(tx: XmlNode | undefined, entry: XmlNode): string | null {
  const rmt = find(tx, "RmtInf");
  const parts = [
    ...all(rmt, "Ustrd").map((u) => u.text.trim()),
    ...all(rmt, "Strd").map((s) => textAt(s, "CdtrRefInf", "Ref") ?? ""),
  ].filter(Boolean);
  if (parts.length) return parts.join(" ").replace(/\s+/g, " ");
  return textAt(tx, "AddtlTxInf") ?? textAt(entry, "AddtlNtryInf");
}

export function parseCamt(text: string): StatementLine[] {
  const doc = parseXml(text);
  const out: StatementLine[] = [];
  for (const entry of descendants(doc, "Ntry")) {
    const booked = isoDate(
      textAt(entry, "BookgDt", "Dt") ?? textAt(entry, "BookgDt", "DtTm") ?? textAt(entry, "ValDt", "Dt") ?? textAt(entry, "ValDt", "DtTm"),
    );
    if (!booked) continue;
    let sign = textAt(entry, "CdtDbtInd") === "DBIT" ? -1 : 1;
    if (textAt(entry, "RvslInd") === "true") sign = -sign;
    const amt = find(entry, "Amt");
    const currency = amt?.attrs.Ccy ?? null;
    const entryRef = textAt(entry, "AcctSvcrRef") ?? textAt(entry, "NtryRef");
    const txs = descendants(entry, "TxDtls");

    if (txs.length <= 1) {
      const tx = txs[0];
      const amount = num(amt?.text);
      if (amount === null) continue;
      const party = counterparty(tx, sign > 0);
      out.push({
        booked_on: booked,
        amount: sign * Math.abs(amount),
        currency,
        payer_name: party.name,
        payer_account: party.account,
        reference: remittance(tx, entry),
        bank_ref: textAt(tx, "Refs", "AcctSvcrRef") ?? entryRef,
      });
      continue;
    }
    // A batch booking: one entry, several transactions, each with its own amount.
    txs.forEach((tx, i) => {
      const amount = num(textAt(tx, "Amt") ?? textAt(tx, "AmtDtls", "TxAmt", "Amt"));
      if (amount === null) return;
      const txInd = textAt(tx, "CdtDbtInd");
      const txSign = txInd ? (txInd === "DBIT" ? -1 : 1) : sign;
      const party = counterparty(tx, txSign > 0);
      const e2e = textAt(tx, "Refs", "EndToEndId");
      out.push({
        booked_on: booked,
        amount: txSign * Math.abs(amount),
        currency,
        payer_name: party.name,
        payer_account: party.account,
        reference: remittance(tx, entry),
        bank_ref:
          textAt(tx, "Refs", "AcctSvcrRef") ??
          (e2e && e2e !== "NOTPROVIDED" ? e2e : null) ??
          (entryRef ? `${entryRef}#${i + 1}` : null),
      });
    });
  }
  return out;
}

// ── CSV ────────────────────────────────────────────────────────────

export interface CsvTable {
  rows: string[][];
  delimiter: string;
}

/** Splits CSV text into rows, choosing the delimiter that gives the most consistent columns. */
export function parseCsv(text: string): CsvTable {
  const candidates = [";", ",", "\t", "|"];
  let best: CsvTable = { rows: [], delimiter: "," };
  let bestScore = -1;
  for (const d of candidates) {
    const rows = splitCsv(text, d);
    const counts = new Map<number, number>();
    for (const r of rows) if (r.length > 1) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let score = 0;
    for (const [cols, freq] of counts) score = Math.max(score, cols > 1 ? freq * Math.min(cols, 12) : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { rows, delimiter: d };
    }
  }
  return best;
}

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      // A blank line stays as an empty row, so row numbers match the file.
      rows.push(row.some((c) => c !== "") ? row : []);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export interface CsvMapping {
  /** The row holding the column names; data starts on the next one. */
  header_row: number;
  date: number;
  /** A signed amount column… */
  amount: number | null;
  /** …or separate money-in and money-out columns. */
  credit: number | null;
  debit: number | null;
  payer_name: number | null;
  payer_account: number | null;
  reference: number | null;
  currency: number | null;
  date_order: "dmy" | "mdy" | "ymd";
  decimal: "," | ".";
}

// Column names banks use, best first. Compared after normalizeText.
const NAMES = {
  date: ["buchungstag", "buchungsdatum", "booking date", "data contabile", "data operazione", "fecha operacion", "date operation", "transaction date", "posting date", "posted date", "date", "datum", "data", "fecha", "boekdatum", "wertstellung", "valutadatum", "value date", "data valuta", "valuta"],
  amount: ["betrag", "amount", "importo", "importe", "montant", "bedrag", "umsatz", "transaction amount", "betrag eur", "amount eur"],
  credit: ["credit", "gutschrift", "haben", "accrediti", "entrate", "avere", "paid in", "money in", "deposit", "deposits", "ingresos", "credito", "incoming", "credit amount"],
  debit: ["debit", "lastschrift", "soll", "addebiti", "uscite", "dare", "paid out", "money out", "withdrawal", "withdrawals", "gastos", "debito", "outgoing", "debit amount"],
  payer_name: ["name zahlungsbeteiligter", "auftraggeber empfanger", "auftraggeber", "zahlungspflichtiger", "beguenstigter zahlungspflichtiger", "begunstigter zahlungspflichtiger", "payer", "sender", "counterparty", "counter party", "other party", "ordinante", "controparte", "naam tegenpartij", "naam", "nom", "name", "from"],
  payer_account: ["iban zahlungsbeteiligter", "iban ordinante", "counterparty iban", "counterparty account", "tegenrekening", "iban", "kontonummer", "account number", "conto"],
  reference: ["verwendungszweck", "causale", "payment reference", "reference", "remittance", "purpose", "memo", "omschrijving", "mededelingen", "concepto", "libelle", "descrizione", "description", "details", "narrative", "particulars", "buchungstext"],
  currency: ["wahrung", "waehrung", "currency", "divisa", "devise", "moneda", "munt"],
} as const;

// The account holder's own account, never the payer's.
const OWN_ACCOUNT = ["auftragskonto", "own account", "mein konto", "account name", "my account"];

function score(header: string, names: readonly string[]): number {
  const h = normalizeText(header);
  if (!h) return 0;
  for (let i = 0; i < names.length; i++) {
    if (h === names[i]) return 1000 - i;
  }
  for (let i = 0; i < names.length; i++) {
    if (h.includes(names[i])) return 500 - i;
  }
  return 0;
}

/** Reads the layout from the header and a sample of the data. Null when no date and amount columns are found. */
export function guessMapping(table: CsvTable): CsvMapping | null {
  const { rows } = table;
  // The header is the first row that names both a date and an amount. Not
  // found by width: some banks end every data row with a delimiter, so the
  // data is one cell wider than its header.
  const headerIndex = rows.findIndex(
    (r, i) =>
      i < 50 &&
      r.some((c) => score(c, NAMES.date) > 0) &&
      r.some((c) => score(c, NAMES.amount) + score(c, NAMES.credit) + score(c, NAMES.debit) > 0),
  );
  if (headerIndex < 0) return null;
  const header = { r: rows[headerIndex], i: headerIndex };
  const cols = header.r;
  const used = new Set<number>();
  const pick = (names: readonly string[], skip: readonly string[] = []): number | null => {
    let bestCol: number | null = null;
    let bestScore = 0;
    cols.forEach((c, i) => {
      if (used.has(i) || skip.some((s) => normalizeText(c).includes(s))) return;
      const s = score(c, names);
      if (s > bestScore) [bestCol, bestScore] = [i, s];
    });
    if (bestCol !== null) used.add(bestCol);
    return bestCol;
  };
  const date = pick(NAMES.date);
  if (date === null) return null;
  const amount = pick(NAMES.amount);
  const credit = amount === null ? pick(NAMES.credit) : null;
  const debit = amount === null ? pick(NAMES.debit) : null;
  if (amount === null && credit === null) return null;
  const payer_account = pick(NAMES.payer_account, OWN_ACCOUNT);
  const payer_name = pick(NAMES.payer_name, OWN_ACCOUNT);
  const reference = pick(NAMES.reference);
  const currency = pick(NAMES.currency);

  const data = rows.slice(header.i + 1).filter((r) => r.length >= 2);
  const amounts = data.flatMap((r) => [amount, credit, debit].filter((c): c is number => c !== null).map((c) => r[c] ?? ""));
  const dates = data.map((r) => r[date] ?? "");
  const decimal = detectDecimal(amounts);
  return {
    header_row: header.i,
    date,
    amount,
    credit,
    debit,
    payer_name,
    payer_account,
    reference,
    currency,
    decimal,
    date_order: detectDateOrder(dates, decimal),
  };
}

function detectDecimal(samples: string[]): "," | "." {
  let comma = 0;
  let dot = 0;
  for (const s of samples) {
    const t = s.replace(/[^\d.,]/g, "");
    if (/,\d{1,2}$/.test(t)) comma++;
    else if (/\.\d{1,2}$/.test(t)) dot++;
    // A thousands group says which mark is NOT the decimal: "1.650" is a
    // comma-decimal file, "1,650" a dot-decimal one.
    else if (/\d\.\d{3}$/.test(t)) comma++;
    else if (/\d,\d{3}$/.test(t)) dot++;
  }
  return comma > dot ? "," : ".";
}

function detectDateOrder(samples: string[], decimal: "," | "."): CsvMapping["date_order"] {
  let dayFirst = false;
  let monthFirst = false;
  let dotted = false;
  for (const s of samples) {
    const m = /(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/.exec(s);
    if (!m) continue;
    if (m[1].length === 4) return "ymd";
    if (s.includes(".")) dotted = true;
    if (+m[1] > 12) dayFirst = true;
    if (+m[2] > 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return "dmy";
  if (monthFirst && !dayFirst) return "mdy";
  return decimal === "," || dotted ? "dmy" : "mdy";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A bank's amount text as a number: "1.650,00", "1,650.00", "-75,00", "(75.00)", "1'650.00", "€ 1.650,00". */
export function parseAmount(raw: string | null | undefined, decimal: "," | "."): number | null {
  if (raw === null || raw === undefined) return null;
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (/^[^\d]*-/.test(s)) negative = true;
  s = s.replace(/[^\d.,']/g, "").replace(/'/g, "");
  s = decimal === "," ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!s) return null;
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return null;
  return negative ? -v : v;
}

/** A bank's date text as `YYYY-MM-DD`. */
export function parseDate(raw: string | null | undefined, order: CsvMapping["date_order"]): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const pad = (n: number) => String(n).padStart(2, "0");
  const build = (y: number, m: number, d: number): string | null => {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = /(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/.exec(s);
  if (m) {
    const [a, b, c] = [+m[1], +m[2], +m[3]];
    if (m[1].length === 4 || order === "ymd") return build(a, b, c);
    return order === "mdy" ? build(c, a, b) : build(c, b, a);
  }
  m = /(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/.exec(s); // 01 Oct 2026
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mi >= 0 ? build(+m[3], mi + 1, +m[1]) : null;
  }
  m = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s); // Oct 1, 2026
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mi >= 0 ? build(+m[3], mi + 1, +m[2]) : null;
  }
  return null;
}

/** The data rows under the header, read with the mapping. Rows that are not
 *  transactions (opening balances, footers) have no date and are skipped. */
export function readCsv(table: CsvTable, mapping: CsvMapping): { lines: StatementLine[]; errors: { row: number; message: string }[] } {
  const lines: StatementLine[] = [];
  const errors: { row: number; message: string }[] = [];
  const cell = (r: string[], c: number | null) => (c === null ? "" : (r[c] ?? "").trim());
  table.rows.slice(mapping.header_row + 1).forEach((r, k) => {
    const rowNo = mapping.header_row + k + 2; // 1-based, as a spreadsheet shows it
    const rawDate = cell(r, mapping.date);
    const booked = parseDate(rawDate, mapping.date_order);
    let amount: number | null = null;
    if (mapping.amount !== null) {
      amount = parseAmount(cell(r, mapping.amount), mapping.decimal);
    } else {
      const inAmt = parseAmount(cell(r, mapping.credit), mapping.decimal);
      const outAmt = parseAmount(cell(r, mapping.debit), mapping.decimal);
      if (inAmt) amount = Math.abs(inAmt);
      else if (outAmt) amount = -Math.abs(outAmt);
      else if (inAmt === 0 || outAmt === 0) amount = 0;
    }
    if (!booked) {
      // No date at all is a balance or a total, not a payment: skipped quietly.
      // A date that is there but unreadable is worth saying.
      if (rawDate) errors.push({ row: rowNo, message: `Unreadable date "${rawDate}"` });
      return;
    }
    if (amount === null) {
      errors.push({ row: rowNo, message: "No amount" });
      return;
    }
    const currency = cell(r, mapping.currency).toUpperCase();
    lines.push({
      booked_on: booked,
      amount,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
      payer_name: cell(r, mapping.payer_name) || null,
      payer_account: normalizeAccount(cell(r, mapping.payer_account)),
      reference: cell(r, mapping.reference).replace(/\s+/g, " ") || null,
      bank_ref: null,
    });
  });
  return { lines, errors };
}
