import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The colour a record type owns: `bg` is its tint, `text` its text role, `dot`
 * and `ring` its solid. Tokens, never Tailwind palette steps — see the
 * "Category families" block in styles.css for why, and for the derivation.
 */
export const colorPalette = {
  sky:     { bg: "bg-cat-sky-tint",     border: "border-cat-sky-solid",     text: "text-cat-sky-text",     ring: "ring-cat-sky-solid",     dot: "bg-cat-sky-solid" },
  emerald: { bg: "bg-cat-emerald-tint", border: "border-cat-emerald-solid", text: "text-cat-emerald-text", ring: "ring-cat-emerald-solid", dot: "bg-cat-emerald-solid" },
  amber:   { bg: "bg-cat-amber-tint",   border: "border-cat-amber-solid",   text: "text-cat-amber-text",   ring: "ring-cat-amber-solid",   dot: "bg-cat-amber-solid" },
  rose:    { bg: "bg-cat-rose-tint",    border: "border-cat-rose-solid",    text: "text-cat-rose-text",    ring: "ring-cat-rose-solid",    dot: "bg-cat-rose-solid" },
  violet:  { bg: "bg-cat-violet-tint",  border: "border-cat-violet-solid",  text: "text-cat-violet-text",  ring: "ring-cat-violet-solid",  dot: "bg-cat-violet-solid" },
  fuchsia: { bg: "bg-cat-fuchsia-tint", border: "border-cat-fuchsia-solid", text: "text-cat-fuchsia-text", ring: "ring-cat-fuchsia-solid", dot: "bg-cat-fuchsia-solid" },
  teal:    { bg: "bg-cat-teal-tint",    border: "border-cat-teal-solid",    text: "text-cat-teal-text",    ring: "ring-cat-teal-solid",    dot: "bg-cat-teal-solid" },
  orange:  { bg: "bg-cat-orange-tint",  border: "border-cat-orange-solid",  text: "text-cat-orange-text",  ring: "ring-cat-orange-solid",  dot: "bg-cat-orange-solid" },
  slate:   { bg: "bg-cat-slate-tint",   border: "border-cat-slate-solid",   text: "text-cat-slate-text",   ring: "ring-cat-slate-solid",   dot: "bg-cat-slate-solid" },
} as const;

export type ColorToken = keyof typeof colorPalette;

export function colorClasses(token: string | null | undefined): typeof colorPalette[ColorToken] {
  return colorPalette[(token as ColorToken)] ?? colorPalette.sky;
}

/** Format an ISO date string 'YYYY-MM-DD' or full datetime to a short date label. */
export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, opts ?? { year: "numeric", month: "short", day: "numeric" });
}

/** Format a number as currency. Uses USD by default. */
export function formatMoney(n: number | null | undefined, currency = "USD"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

/** YYYY-MM-DD for a given Date in local time. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM for the current month. */
export function currentPeriod(): string {
  return toIsoDate(new Date()).slice(0, 7);
}

/** Add or subtract months from a 'YYYY-MM' string. */
export function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Pretty 'April 2026' for 'YYYY-MM'. */
export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Days between two ISO dates (positive = b after a). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  return Math.round((db - da) / 86_400_000);
}
