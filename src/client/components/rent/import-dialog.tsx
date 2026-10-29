import { useEffect, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, formatDate, formatExact } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  decodeBytes, detectFormat, guessMapping, parseCamt, parseCsv, readCsv,
  type CsvMapping, type CsvTable, type StatementLine,
} from "@shared/statement";
import type { ImportSummary } from "@/types";

const SETTINGS_KEY = "bank_csv_mappings";
const BATCH = 400; // lines per request; the server takes up to 500
const EMPTY = String.fromCharCode(0x2014);

type Parsed =
  | { format: "camt053"; lines: StatementLine[] }
  | { format: "csv"; table: CsvTable; mapping: CsvMapping | null; signature: string };

/** A bank's CSV layout is recognised by its header, so a mapping corrected once is reused. */
function signatureOf(table: CsvTable, mapping: CsvMapping | null): string {
  const header = mapping ? table.rows[mapping.header_row] : table.rows.find((r) => r.length > 1);
  return (header ?? []).join("|").toLowerCase();
}

export function ImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (summary: ImportSummary) => void;
}) {
  const app = useApp();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setParsed(null);
    setProblem(null);
    setSummary(null);
  }, [open]);

  async function pick(file: File) {
    setProblem(null);
    setSummary(null);
    setFileName(file.name);
    try {
      const text = decodeBytes(await file.arrayBuffer());
      if (detectFormat(text) === "camt053") {
        const lines = parseCamt(text);
        if (!lines.length) throw new Error("This CAMT file has no booked entries.");
        setParsed({ format: "camt053", lines });
        return;
      }
      const table = parseCsv(text);
      let mapping = guessMapping(table);
      const signature = signatureOf(table, mapping);
      // A layout corrected before wins over the guess.
      const saved = await api<{ settings: Record<string, string> }>("GET", "/api/settings").catch(() => null);
      try {
        const known = JSON.parse(saved?.settings[SETTINGS_KEY] ?? "{}") as Record<string, CsvMapping>;
        if (known[signature]) mapping = known[signature];
      } catch {
        /* an unreadable saved mapping is ignored */
      }
      setParsed({ format: "csv", table, mapping, signature });
      if (!mapping) setProblem("No date and amount columns were recognised. Choose them below.");
    } catch (err) {
      setParsed(null);
      setProblem(`This file could not be read: ${(err as Error).message}`);
    }
  }

  const read = useMemo(() => {
    if (!parsed) return null;
    if (parsed.format === "camt053") return { lines: parsed.lines, errors: [] as { row: number; message: string }[] };
    if (!parsed.mapping) return null;
    return readCsv(parsed.table, parsed.mapping);
  }, [parsed]);

  const incoming = read?.lines.filter((l) => l.amount > 0) ?? [];
  const outgoing = (read?.lines.length ?? 0) - incoming.length;

  async function submit() {
    if (!parsed || !read || !incoming.length) return;
    setBusy(true);
    try {
      const total: ImportSummary = { lines: read.lines.length, money_out_skipped: outgoing, duplicates: 0, imported: 0, auto_matched: 0, to_review: 0 };
      for (let i = 0; i < incoming.length; i += BATCH) {
        const res = await api<{ summary: ImportSummary }>("POST", "/api/bank/imports", {
          filename: fileName,
          format: parsed.format,
          lines: incoming.slice(i, i + BATCH),
        });
        total.duplicates += res.summary.duplicates;
        total.imported += res.summary.imported;
        total.auto_matched += res.summary.auto_matched;
        total.to_review += res.summary.to_review;
      }
      if (parsed.format === "csv" && parsed.mapping) {
        const saved = await api<{ settings: Record<string, string> }>("GET", "/api/settings").catch(() => null);
        let known: Record<string, CsvMapping> = {};
        try {
          known = JSON.parse(saved?.settings[SETTINGS_KEY] ?? "{}");
        } catch {
          known = {};
        }
        const keep = Object.entries({ ...known, [parsed.signature]: parsed.mapping }).slice(-10);
        await api("PUT", "/api/settings", { [SETTINGS_KEY]: JSON.stringify(Object.fromEntries(keep)) }).catch(() => undefined);
      }
      setSummary(total);
      onImported(total);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a bank statement</DialogTitle>
          <DialogDescription>
            A CSV export from any bank, or a CAMT.053 file from a European bank. Only money in is imported, and a payment
            already imported from an earlier statement is skipped.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <ImportResult summary={summary} />
        ) : (
          <div className="grid gap-4">
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md bg-muted px-4 py-3 text-sm transition-colors duration-150 hover:bg-muted/70",
                "focus-within:ring-[3px] focus-within:ring-ring/40",
              )}
            >
              <FileUp className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {fileName ? <span className="font-medium">{fileName}</span> : "Choose a statement file (.csv or .xml)"}
              </span>
              <span className="text-xs text-muted-foreground">{fileName ? "Choose another" : "Browse"}</span>
              <input
                type="file"
                accept=".csv,.txt,.xml,.camt,.053,text/csv,text/plain,application/xml,text/xml"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void pick(f);
                  e.target.value = "";
                }}
              />
            </label>

            {problem ? <p className="text-sm text-destructive">{problem}</p> : null}

            {parsed?.format === "csv" ? (
              <MappingEditor
                table={parsed.table}
                mapping={parsed.mapping}
                onChange={(mapping) => setParsed({ ...parsed, mapping })}
              />
            ) : null}

            {read ? (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">
                  {parsed?.format === "camt053" ? "CAMT.053 statement · " : ""}
                  {read.lines.length} lines · <span className="font-medium text-foreground">{incoming.length} money in</span>
                  {outgoing ? ` · ${outgoing} money out (skipped)` : ""}
                  {read.errors.length ? ` · ${read.errors.length} unreadable` : ""}
                </p>
                <Preview lines={incoming.slice(0, 6)} currency={app.settings.currency} />
                {read.errors.length ? (
                  <p className="text-xs text-muted-foreground">
                    Not imported: {read.errors.slice(0, 3).map((e) => `row ${e.row} (${e.message})`).join(", ")}
                    {read.errors.length > 3 ? `, and ${read.errors.length - 3} more` : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {summary ? (
            <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" onClick={submit} disabled={busy || !incoming.length}>
                {busy ? "Importing…" : incoming.length ? `Import ${incoming.length} payment${incoming.length === 1 ? "" : "s"}` : "Import"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportResult({ summary }: { summary: ImportSummary }) {
  const rows: [string, number][] = [
    ["Matched automatically", summary.auto_matched],
    ["To review", summary.to_review],
    ["Already imported", summary.duplicates],
    ["Money out, skipped", summary.money_out_skipped],
  ];
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        <span className="font-medium">{summary.imported} payment{summary.imported === 1 ? "" : "s"} imported.</span>{" "}
        {summary.auto_matched
          ? "Payers you confirmed before, paying exactly what they owe, are already recorded in the ledger."
          : "Confirm each match once, and that payer is matched by itself from the next statement on."}
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-md shadow-edge">
        {rows.map(([label, n]) => (
          <li key={label} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Preview({ lines, currency }: { lines: StatementLine[]; currency: string }) {
  if (!lines.length) return null;
  return (
    <div className="overflow-hidden rounded-md shadow-edge">
      <table className="w-full text-[0.8125rem]">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-normal">Date</th>
            <th className="px-3 py-1.5 font-normal">From</th>
            <th className="px-3 py-1.5 font-normal">Reference</th>
            <th className="px-3 py-1.5 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{formatDate(l.booked_on)}</td>
              <td className="max-w-[10rem] truncate px-3 py-1.5">{l.payer_name ?? EMPTY}</td>
              <td className="max-w-[14rem] truncate px-3 py-1.5 text-muted-foreground">{l.reference ?? EMPTY}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatExact(l.amount, l.currency ?? currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NONE = "none";

function MappingEditor({
  table, mapping, onChange,
}: {
  table: CsvTable;
  mapping: CsvMapping | null;
  onChange: (m: CsvMapping) => void;
}) {
  // Without a recognised header, the first row with several cells is taken as one.
  const headerRow = mapping?.header_row ?? Math.max(0, table.rows.findIndex((r) => r.length > 1));
  const header = table.rows[headerRow] ?? [];
  const m: CsvMapping = mapping ?? {
    header_row: headerRow, date: 0, amount: 1, credit: null, debit: null, payer_name: null,
    payer_account: null, reference: null, currency: null, date_order: "dmy", decimal: ",",
  };
  const split = m.amount === null;
  const set = (patch: Partial<CsvMapping>) => onChange({ ...m, ...patch });

  const column = (label: string, value: number | null, onPick: (v: number | null) => void, required = false) => (
    <div>
      <Label>{label}</Label>
      <Select value={value === null ? NONE : String(value)} onValueChange={(v) => onPick(v === NONE ? null : Number(v))}>
        <SelectTrigger className="[&>span]:text-left"><SelectValue /></SelectTrigger>
        <SelectContent>
          {!required ? <SelectItem value={NONE}>Not in this file</SelectItem> : null}
          {header.map((h, i) => (
            <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="grid gap-3 rounded-md p-3 shadow-edge">
      <div className="flex items-center justify-between gap-3">
        <div className="section-label">Columns in this file</div>
        <Select
          value={split ? "split" : "signed"}
          onValueChange={(v) =>
            v === "split"
              ? set({ amount: null, credit: m.credit ?? m.amount ?? 0, debit: m.debit })
              : set({ amount: m.amount ?? m.credit ?? 0, credit: null, debit: null })
          }
        >
          <SelectTrigger className="w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="signed">One amount column</SelectItem>
            <SelectItem value="split">Money in and money out columns</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {column("Date", m.date, (v) => set({ date: v ?? 0 }), true)}
        {split
          ? (
            <>
              {column("Money in", m.credit, (v) => set({ credit: v }), true)}
              {column("Money out", m.debit, (v) => set({ debit: v }))}
            </>
          )
          : column("Amount", m.amount, (v) => set({ amount: v ?? 0 }), true)}
        {column("Payer name", m.payer_name, (v) => set({ payer_name: v }))}
        {column("Payer IBAN or account", m.payer_account, (v) => set({ payer_account: v }))}
        {column("Reference or description", m.reference, (v) => set({ reference: v }))}
        <div>
          <Label>Dates are written</Label>
          <Select value={m.date_order} onValueChange={(v) => set({ date_order: v as CsvMapping["date_order"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dmy">Day first: 31.12.2026</SelectItem>
              <SelectItem value="mdy">Month first: 12/31/2026</SelectItem>
              <SelectItem value="ymd">Year first: 2026-12-31</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Amounts are written</Label>
          <Select value={m.decimal} onValueChange={(v) => set({ decimal: v as CsvMapping["decimal"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value=",">1.234,56</SelectItem>
              <SelectItem value=".">1,234.56</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
