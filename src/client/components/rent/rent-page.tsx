import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Receipt, Sparkles } from "lucide-react";
import { useApp } from "@/context";
import { addMonths, cn, currentPeriod, formatDate, formatMoney, formatPeriod } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentDialog } from "./payment-dialog";
import type { ChargeStatus, RentCharge } from "@/types";
import { PageShell } from "@/components/page-shell";

const STATUS_TONE: Record<ChargeStatus, string> = {
  open: "bg-info-tint text-info",
  partial: "bg-warning-tint text-warning",
  paid: "bg-success-tint text-success",
  overdue: "bg-destructive-tint text-destructive",
  waived: "bg-muted text-muted-foreground",
};

export function RentPage() {
  const app = useApp();
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<RentCharge | null>(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const list = await app.listCharges(period);
      setCharges(list);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await app.generateCharges(period);
      await load();
      app.setError(res.created ? null : "All active leases already have a charge for this period.");
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const totals = useMemo(() => {
    const charged = charges.reduce((s, c) => s + (c.amount ?? 0), 0);
    const collected = charges.reduce((s, c) => s + (c.amount_paid ?? 0), 0);
    const outstanding = Math.max(0, charged - collected);
    const overdue = charges
      .filter((c) => c.status === "overdue" || (c.status !== "paid" && c.status !== "waived" && c.due_date < new Date().toISOString().slice(0, 10) && c.amount_paid < c.amount))
      .reduce((s, c) => s + ((c.amount ?? 0) - (c.amount_paid ?? 0)), 0);
    return { charged, collected, outstanding, overdue };
  }, [charges]);

  return (
    <PageShell
      title="Rent ledger"
      meta="Charges and payments per period"
      actions={
        <>
          {/* The period stepper is view state, so it sits left of the one ink
              action and names its current value rather than saying "Period". */}
          <div className="inline-flex items-center rounded-full bg-muted p-[0.1875rem]">
            <Button variant="ghost" size="icon" onClick={() => setPeriod((p) => addMonths(p, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => setPeriod(currentPeriod())}
              className={cn(
                "rounded-sm px-3 py-1 text-sm font-medium transition-colors duration-150",
                period === currentPeriod()
                  ? "bg-card text-foreground shadow-raised"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {formatPeriod(period)}
            </button>
            <Button variant="ghost" size="icon" onClick={() => setPeriod((p) => addMonths(p, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {charges.length > 0 ? (
            <Button onClick={generate} disabled={generating}>
              <Sparkles className="h-4 w-4" /> Generate charges
            </Button>
          ) : null}
        </>
      }
    >
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Charged" value={formatMoney(totals.charged, app.settings.currency)} />
          <Stat label="Collected" value={formatMoney(totals.collected, app.settings.currency)} tone="positive" />
          <Stat
            label="Outstanding"
            value={formatMoney(totals.outstanding, app.settings.currency)}
            tone={totals.outstanding > 0 ? "warn" : "default"}
          />
          <Stat
            label="Overdue"
            value={formatMoney(totals.overdue, app.settings.currency)}
            tone={totals.overdue > 0 ? "danger" : "default"}
          />
        </section>

        {loading ? (
          <Card className="divide-y divide-border overflow-hidden" role="status" aria-label="Loading rent charges">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex h-11 items-center gap-4 px-3" aria-hidden>
                <div className="h-2.5 w-32 animate-pulse rounded-full bg-muted" />
                <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
                <div className="ml-auto h-2.5 w-16 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </Card>
        ) : charges.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <Receipt className="size-7 text-faint" aria-hidden />
            <p className="font-medium">No rent charges for {formatPeriod(period)}</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Generate charges from active leases for this month.
            </p>
            <Button className="mt-2" onClick={generate} disabled={generating}>
              <Sparkles className="size-4" /> Generate charges
            </Button>
          </div>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property · Unit</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((c) => {
                  const balance = Math.max(0, (c.amount ?? 0) - (c.amount_paid ?? 0));
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-muted-foreground">{c.property_name}</span>
                          <span className="px-1 text-muted-foreground/40">·</span>
                          <span className="font-medium">{c.unit_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.tenant_first_name ? (
                          <span className="text-sm">{c.tenant_first_name} {c.tenant_last_name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(c.due_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.amount, app.settings.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.amount_paid, app.settings.currency)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", balance > 0 && "text-warning", c.status === "overdue" && "text-destructive")}>
                        {formatMoney(balance, app.settings.currency)}
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_TONE[c.status])}>
                          {c.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {c.status !== "paid" && c.status !== "waived" && (
                          <Button size="sm" variant="outline" onClick={() => setPaymentTarget(c)}>
                            Record payment
                          </Button>
                        )}
                        {(c.status === "paid" || c.amount_paid > 0) && (
                          <Button size="sm" variant="ghost" onClick={() => setPaymentTarget(c)}>
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

      <PaymentDialog
        open={paymentTarget !== null}
        onOpenChange={(o) => { if (!o) setPaymentTarget(null); }}
        charge={paymentTarget}
        onSaved={load}
      />
    </PageShell>
  );
}

function Stat({
  label, value, tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warn" | "danger";
}) {
  return (
    <Card className="p-4">
      <div className="stat-label">{label}</div>
      <div className={cn(
        "mt-1 text-xl font-semibold tabular-nums",
        tone === "positive" && "text-success",
        tone === "warn" && "text-warning",
        tone === "danger" && "text-destructive",
      )}>
        {value}
      </div>
    </Card>
  );
}
