import { useEffect, useState } from "react";
import { Landmark, RefreshCw, Upload } from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, formatDate, formatExact, formatPeriod } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageShell } from "@/components/page-shell";
import { maskAccount } from "@shared/text";
import { RentTabs } from "./rent-tabs";
import { ImportDialog } from "./import-dialog";
import { AssignDialog } from "./assign-dialog";
import type { BankEvidence, BankTransaction, LeaseLabel } from "@/types";

type View = "review" | "matched" | "ignored";

const VIEWS: { key: View; label: string }[] = [
  { key: "review", label: "To review" },
  { key: "matched", label: "Matched" },
  { key: "ignored", label: "Ignored" },
];

// Why a lease was suggested, in the person's words.
const EVIDENCE: Record<BankEvidence, string> = {
  known_account: "Known account",
  known_name: "Known payer",
  tenant_name: "Tenant's name",
  tenant_last_name: "Same surname",
  reference_unit: "Unit in reference",
  amount_exact: "Exact amount",
  amount_only: "Only lease owing this",
};

const BY: Record<string, string> = { auto: "Automatic", person: "You", agent: "Agent" };

function leaseName(l: LeaseLabel | null | undefined) {
  if (!l) return null;
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{l.tenant_name ?? "No tenant"}</span>
      <span className="block truncate text-xs text-muted-foreground">{l.property_name} · {l.unit_name}</span>
    </span>
  );
}

const months = (periods: (string | null)[]) => periods.filter(Boolean).map((p) => formatPeriod(p!)).join(", ");

export function BankPage({ navigate }: { navigate: (to: string) => void }) {
  const app = useApp();
  const [view, setView] = useState<View>("review");
  const [rows, setRows] = useState<BankTransaction[]>([]);
  const [counts, setCounts] = useState({ review: 0, matched: 0, ignored: 0 });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState<{ tx: BankTransaction; leaseId: number | null } | null>(null);
  const [undoing, setUndoing] = useState<BankTransaction | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(v: View = view) {
    try {
      setLoading(true);
      const r = await api<{ transactions: BankTransaction[]; counts: typeof counts }>("GET", `/api/bank/transactions?status=${v}&limit=90`);
      setRows(r.transactions);
      setCounts(r.counts);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(view); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  async function act(tx: BankTransaction, path: string, body?: unknown) {
    setBusy(tx.id);
    try {
      await api("POST", `/api/bank/transactions/${tx.id}/${path}`, body ?? {});
      await load();
      void app.refreshAttention();
    } catch (err) {
      app.setError((err as Error).message);
      await load();
    } finally {
      setBusy(null);
    }
  }

  function confirm(tx: BankTransaction) {
    const p = tx.proposal;
    if (!p?.lease) return;
    void act(tx, "match", { lease_id: p.lease.lease_id, allocations: p.allocations.map(({ charge_id, amount }) => ({ charge_id, amount })) });
  }

  async function rematch() {
    try {
      const r = await api<{ auto_matched: number }>("POST", "/api/bank/rematch");
      setNotice(r.auto_matched ? `${r.auto_matched} payment${r.auto_matched === 1 ? "" : "s"} matched.` : "Nothing new matched. The rest needs a person.");
      await load();
      void app.refreshAttention();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  const empty = !loading && counts.review + counts.matched + counts.ignored === 0;
  const currency = (tx: BankTransaction) => tx.currency ?? app.settings.currency;

  return (
    <PageShell
      title="Bank matching"
      meta={empty ? undefined : `${counts.review} to review · ${counts.matched} matched`}
      actions={
        <>
          {counts.review > 0 ? (
            <Button variant="secondary" onClick={rematch} aria-label="Match again">
              <RefreshCw className="size-4" /> <span className="hidden sm:inline">Match again</span>
            </Button>
          ) : null}
          {/* The empty state carries the one ink action on a first visit. */}
          {!empty ? (
            <Button onClick={() => setImporting(true)}>
              <Upload className="size-4" /> <span className="sm:hidden">Import</span><span className="hidden sm:inline">Import statement</span>
            </Button>
          ) : null}
        </>
      }
    >
      <RentTabs active="bank" navigate={navigate} />

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <Landmark className="size-7 text-faint" aria-hidden />
          <p className="font-medium">Match rent from your bank statement</p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Import a statement from your bank: a CSV from any bank, or a CAMT.053 file from a European one. Each payment
            is matched to the rent it pays. Confirm a payer once, and their next payment is recorded by itself.
          </p>
          <Button className="mt-2" onClick={() => setImporting(true)}>
            <Upload className="size-4" /> Import statement
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-muted p-[0.1875rem]" role="tablist" aria-label="Bank lines">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={view === v.key}
                  onClick={() => { setNotice(null); setView(v.key); }}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
                    view === v.key ? "bg-card text-foreground shadow-raised" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                  <span className="tabular-nums text-muted-foreground">{counts[v.key]}</span>
                </button>
              ))}
            </div>
            {notice ? <p className="text-sm text-muted-foreground" role="status">{notice}</p> : null}
          </div>

          {loading ? (
            <div className="divide-y divide-border overflow-hidden rounded-md shadow-edge" role="status" aria-label="Loading bank lines">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex h-12 items-center gap-4 px-3" aria-hidden>
                  <div className="h-2.5 w-20 animate-pulse rounded-full bg-muted" />
                  <div className="h-2.5 w-32 animate-pulse rounded-full bg-muted" />
                  <div className="ml-auto h-2.5 w-16 animate-pulse rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : !rows.length ? (
            <p className="px-1 py-10 text-center text-sm text-muted-foreground">
              {view === "review"
                ? "Nothing to review. Every payment from your statements is matched or set aside."
                : view === "matched"
                  ? "No payments matched yet."
                  : "Nothing ignored."}
            </p>
          ) : view === "review" ? (
            <>
            {/* A phone gets one card per payment, actions in reach; the table needs the width. */}
            <ul className="grid gap-3 md:hidden">
              {rows.map((tx) => (
                <li key={tx.id} className="grid gap-2 rounded-md p-3 shadow-edge">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{tx.payer_name ?? "Unknown payer"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(tx.booked_on)}{tx.reference ? ` · ${tx.reference}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatExact(tx.amount, currency(tx))}</span>
                  </div>
                  <ProposalCell tx={tx} currency={currency(tx)} onPick={(leaseId) => setAssigning({ tx, leaseId })} />
                  <RowActions tx={tx} busy={busy === tx.id} onConfirm={confirm} onAssign={() => setAssigning({ tx, leaseId: null })} onIgnore={() => act(tx, "ignore")} />
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Pays</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => {
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(tx.booked_on)}</TableCell>
                      <TableCell className="max-w-[12rem]">
                        <span className="block truncate">{tx.payer_name ?? "Unknown payer"}</span>
                        {tx.payer_account ? <span className="block text-xs text-muted-foreground">{maskAccount(tx.payer_account)}</span> : null}
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <span className="line-clamp-2 text-muted-foreground">{tx.reference ?? ""}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatExact(tx.amount, currency(tx))}</TableCell>
                      <TableCell className="min-w-[15rem]">
                        <ProposalCell tx={tx} currency={currency(tx)} onPick={(leaseId) => setAssigning({ tx, leaseId })} />
                      </TableCell>
                      <TableCell>
                        <RowActions tx={tx} busy={busy === tx.id} onConfirm={confirm} onAssign={() => setAssigning({ tx, leaseId: null })} onIgnore={() => act(tx, "ignore")} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </>
          ) : view === "matched" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Matched by</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(tx.booked_on)}</TableCell>
                    <TableCell className="max-w-[12rem]"><span className="block truncate">{tx.payer_name ?? "Unknown payer"}</span></TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatExact(tx.amount, currency(tx))}</TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        {leaseName(tx.lease)}
                        <span className="text-xs text-muted-foreground">{months((tx.payments ?? []).map((p) => p.period))}</span>
                        {(tx.unapplied ?? 0) > 0 ? (
                          <span className="text-xs text-warning">{formatExact(tx.unapplied!, currency(tx))} not applied</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 text-xs leading-5">{BY[tx.matched_by ?? ""] ?? "You"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={busy === tx.id} onClick={() => setUndoing(tx)}>Undo</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(tx.booked_on)}</TableCell>
                    <TableCell className="max-w-[12rem]"><span className="block truncate">{tx.payer_name ?? "Unknown payer"}</span></TableCell>
                    <TableCell className="max-w-[16rem]"><span className="line-clamp-2 text-muted-foreground">{tx.note ?? tx.reference ?? ""}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{formatExact(tx.amount, currency(tx))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={busy === tx.id} onClick={() => act(tx, "restore")}>Back to review</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={() => {
          setView("review");
          void load("review");
          void app.refreshAttention();
        }}
      />
      <AssignDialog
        tx={assigning?.tx ?? null}
        initialLeaseId={assigning?.leaseId ?? null}
        onOpenChange={(o) => { if (!o) setAssigning(null); }}
        onAssigned={() => { void load(); void app.refreshAttention(); }}
      />
      {undoing ? (
        <ConfirmDelete
          open
          onOpenChange={(o) => { if (!o) setUndoing(null); }}
          title={`Undo the ${formatExact(undoing.amount, currency(undoing))} match to ${undoing.lease?.tenant_name ?? "this lease"}?`}
          description={
            undoing.matched_by === "auto"
              ? "The payment comes out of the ledger and goes back to To review. This payer will no longer be matched to this lease automatically."
              : "The payment comes out of the ledger and goes back to To review."
          }
          confirmLabel="Undo match"
          onConfirm={() => {
            const tx = undoing;
            setUndoing(null);
            void act(tx, "unmatch", { forget_payer: tx.matched_by === "auto" });
          }}
        />
      ) : null}
    </PageShell>
  );
}

/** What a payment pays: the suggested lease and why, or the leases it could be. */
function ProposalCell({ tx, currency, onPick }: { tx: BankTransaction; currency: string; onPick: (leaseId: number) => void }) {
  const p = tx.proposal;
  if (p?.lease) {
    return (
      <div className="grid gap-1">
        {leaseName(p.lease)}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {p.allocations.length ? (
            <span className="rounded-full bg-muted px-2 text-xs leading-5">{months(p.allocations.map((a) => a.period))}</span>
          ) : null}
          {/* Why: supporting facts, so quiet text rather than badges. */}
          <span className="text-xs text-muted-foreground">{p.evidence.map((e) => EVIDENCE[e]).join(" · ")}</span>
        </div>
        {p.unapplied > 0 ? <span className="text-xs text-warning">{formatExact(p.unapplied, currency)} more than the lease owes</span> : null}
      </div>
    );
  }
  if (p?.candidates.length) {
    return (
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">Could be</span>
        <div className="flex flex-wrap gap-1">
          {p.candidates.map((cand) => (
            <button
              key={cand.lease_id}
              type="button"
              onClick={() => onPick(cand.lease_id)}
              className="rounded-full bg-muted px-2 text-xs leading-5 transition-colors duration-150 hover:bg-muted/70"
              aria-label={`Assign to ${cand.tenant_name ?? "this lease"}, ${cand.property_name} ${cand.unit_name}`}
            >
              {cand.tenant_name ?? cand.unit_name} · {formatExact(cand.owing, currency)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">No lease owes this</span>;
}

function RowActions({
  tx, busy, onConfirm, onAssign, onIgnore,
}: {
  tx: BankTransaction;
  busy: boolean;
  onConfirm: (tx: BankTransaction) => void;
  onAssign: () => void;
  onIgnore: () => void;
}) {
  const p = tx.proposal;
  return (
    <div className="flex flex-wrap items-center gap-1 md:justify-end">
      {p?.lease && p.allocations.length ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onConfirm(tx)}>Confirm</Button>
      ) : null}
      <Button size="sm" variant={p?.lease ? "ghost" : "secondary"} disabled={busy} onClick={onAssign}>
        {p?.lease ? "Other lease" : "Assign"}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onIgnore}>Not rent</Button>
    </div>
  );
}
