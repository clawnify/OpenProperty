import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, formatDate, formatExact, formatPeriod } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { allocate, payOrder, periodHint } from "@shared/matching";
import type { BankLease, BankTransaction } from "@/types";

/**
 * Assign a payment to a lease by hand: the money pays the oldest open charge
 * first (the month the reference names, first), exactly as the server will.
 */
export function AssignDialog({
  tx, onOpenChange, onAssigned, initialLeaseId,
}: {
  tx: BankTransaction | null;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
  initialLeaseId?: number | null;
}) {
  const app = useApp();
  const [leases, setLeases] = useState<BankLease[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const currency = tx?.currency ?? app.settings.currency;

  useEffect(() => {
    if (!tx) return;
    setQ("");
    setRemember(true);
    setSelected(initialLeaseId ?? tx.proposal?.lease?.lease_id ?? null);
    api<{ leases: BankLease[] }>("GET", "/api/bank/leases")
      .then((r) => setLeases(r.leases))
      .catch((err) => app.setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, initialLeaseId]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return leases;
    return leases.filter((l) =>
      [l.tenant_name, l.property_name, l.unit_name].some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [leases, q]);

  const lease = leases.find((l) => l.lease_id === selected) ?? null;
  const plan = useMemo(() => {
    if (!tx || !lease) return null;
    return allocate(tx.amount, payOrder(lease.open, periodHint(tx.reference, tx.booked_on)));
  }, [tx, lease]);
  const periodOf = (chargeId: number) => lease?.open.find((c) => c.id === chargeId)?.period ?? "";

  async function save() {
    if (!tx || !lease || !plan?.allocations.length) return;
    setBusy(true);
    try {
      await api("POST", `/api/bank/transactions/${tx.id}/match`, { lease_id: lease.lease_id, allocations: plan.allocations, remember });
      onAssigned();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={tx !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign {tx ? formatExact(tx.amount, currency) : ""} to a lease</DialogTitle>
          <DialogDescription>
            {tx ? `${tx.payer_name ?? "Unknown payer"} · ${formatDate(tx.booked_on)}${tx.reference ? ` · "${tx.reference}"` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tenant, property or unit" className="pl-9" aria-label="Search leases" />
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md shadow-edge" role="listbox" aria-label="Leases">
            {shown.map((l) => (
              <li key={l.lease_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === l.lease_id}
                  onClick={() => setSelected(l.lease_id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-muted",
                    selected === l.lease_id && "bg-muted font-medium",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{l.tenant_name ?? "No tenant"}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {l.property_name} · {l.unit_name}
                    </span>
                  </span>
                  <span className={cn("shrink-0 tabular-nums", l.owing > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {l.owing > 0 ? `owes ${formatExact(l.owing, currency)}` : "nothing open"}
                  </span>
                </button>
              </li>
            ))}
            {!shown.length ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No lease matches “{q}”.</li> : null}
          </ul>

          {lease && plan ? (
            plan.allocations.length ? (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <div className="section-label mb-1">This records</div>
                <ul className="grid gap-0.5">
                  {plan.allocations.map((a) => (
                    <li key={a.charge_id} className="flex justify-between gap-3">
                      <span>{formatPeriod(periodOf(a.charge_id))}</span>
                      <span className="tabular-nums">{formatExact(a.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
                {plan.unapplied > 0 ? (
                  <p className="mt-1 text-warning">
                    {formatExact(plan.unapplied, currency)} is more than this lease owes and stays unapplied.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing is open on this lease. Generate its rent charges on the Ledger first, then assign the payment.
              </p>
            )
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-foreground" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              Remember this payer for this lease
              <span className="block text-xs text-muted-foreground">
                Next time {tx?.payer_name ?? "this payer"} pays exactly what is owed, it is recorded on import.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={busy || !plan?.allocations.length}>Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
