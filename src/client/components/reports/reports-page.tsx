import { useEffect, useState } from "react";
import { api } from "@/api";
import { useApp } from "@/context";
import { currentPeriod, formatMoney, formatDate, formatPeriod, addMonths, exportToCsv, cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ReceiptDialog } from "@/components/rent/receipt-dialog";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Loader2,
} from "lucide-react";

interface RentRollItem {
  id: number;
  period: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  amount_credited: number;
  status: string;
  unit_id: number;
  unit_name: string;
  property_id: number;
  property_name: string;
  tenant_name: string | null;
  tenant_phone: string | null;
}

interface ArrearsItem {
  id: number;
  period: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  amount_credited: number;
  status: string;
  property_name: string;
  unit_name: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_email: string | null;
  balance: number;
  days_overdue: number;
}

interface PaymentItem {
  id: number;
  paid_at: string;
  amount: number;
  applied_amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  charge_period: string;
  property_name: string;
  unit_name: string;
  tenant_name: string | null;
}

export function ReportsPage() {
  const { settings, setError } = useApp();
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [activeTab, setActiveTab] = useState("rent-roll");

  // Rent roll state
  const [rentRoll, setRentRoll] = useState<RentRollItem[]>([]);
  const [rentRollTotals, setRentRollTotals] = useState({
    charged: 0,
    collected: 0,
    credited: 0,
    outstanding: 0,
    overdue: 0,
    count: 0,
  });
  const [rentRollLoading, setRentRollLoading] = useState(true);

  // Arrears state
  const [arrears, setArrears] = useState<ArrearsItem[]>([]);
  const [totalOverdue, setTotalOverdue] = useState(0);
  const [arrearsLoading, setArrearsLoading] = useState(true);

  // Payments state
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  // Receipt preview
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);

  // Load rent roll
  useEffect(() => {
    (async () => {
      try {
        setRentRollLoading(true);
        const res = await api<{
          period: string;
          totals: typeof rentRollTotals;
          charges: RentRollItem[];
        }>("GET", `/api/reports/rent-roll?period=${encodeURIComponent(period)}`);
        setRentRoll(res.charges);
        setRentRollTotals(res.totals);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setRentRollLoading(false);
      }
    })();
  }, [period, setError]);

  // Load arrears
  useEffect(() => {
    (async () => {
      try {
        setArrearsLoading(true);
        const res = await api<{ total_overdue: number; count: number; arrears: ArrearsItem[] }>(
          "GET",
          "/api/reports/arrears"
        );
        setArrears(res.arrears);
        setTotalOverdue(res.total_overdue);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setArrearsLoading(false);
      }
    })();
  }, [setError]);

  // Load payments
  useEffect(() => {
    (async () => {
      try {
        setPaymentsLoading(true);
        const res = await api<{ payments: PaymentItem[] }>("GET", "/api/reports/payments");
        setPayments(res.payments);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setPaymentsLoading(false);
      }
    })();
  }, [setError]);

  // Export handlers
  function handleExportRentRoll() {
    const headers = ["Property", "Unit", "Tenant", "Due Date", "Charged (KES)", "Cash applied (KES)", "Credit applied (KES)", "Balance (KES)", "Status"];
    const rows = rentRoll.map((r) => [
      r.property_name,
      r.unit_name,
      r.tenant_name || "Vacant / No Tenant",
      r.due_date,
      r.amount,
      r.amount_paid,
      r.amount_credited,
      r.status === "waived" ? 0 : Math.max(0, r.amount - r.amount_paid - r.amount_credited),
      r.status,
    ]);
    exportToCsv(`KodiTrack_Rent_Roll_${period}`, headers, rows);
  }

  function handleExportArrears() {
    const headers = ["Property", "Unit", "Tenant", "Phone", "Due Date", "Days Overdue", "Amount (KES)", "Cash applied (KES)", "Credit applied (KES)", "Balance (KES)"];
    const rows = arrears.map((a) => [
      a.property_name,
      a.unit_name,
      a.tenant_name || "—",
      a.tenant_phone || "—",
      a.due_date,
      a.days_overdue,
      a.amount,
      a.amount_paid,
      a.amount_credited,
      a.balance,
    ]);
    exportToCsv(`KodiTrack_Arrears_Report_${currentPeriod()}`, headers, rows);
  }

  function handleExportPayments() {
    const headers = ["Receipt No", "Date", "Property", "Unit", "Tenant", "Amount (KES)", "Method", "Reference", "Notes"];
    const rows = payments.map((p) => [
      `KTR-${String(p.id).padStart(5, "0")}`,
      p.paid_at,
      p.property_name,
      p.unit_name,
      p.tenant_name || "—",
      p.amount,
      p.method.toUpperCase(),
      p.reference || "—",
      p.notes || "—",
    ]);
    exportToCsv(`KodiTrack_Payment_Ledger_${currentPeriod()}`, headers, rows);
  }

  const collectionRate =
    rentRollTotals.charged > 0
      ? Math.round(((rentRollTotals.collected + rentRollTotals.credited) / rentRollTotals.charged) * 100)
      : 0;

  return (
    <PageShell
      title="Financial Reports"
      meta="Monthly rent roll, arrears tracking, and audit ledgers"
      actions={
        activeTab === "rent-roll" ? (
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full bg-muted p-[0.1875rem]">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPeriod((p) => addMonths(p, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => setPeriod(currentPeriod())}
                className={cn(
                  "rounded-sm px-3 py-1 text-sm font-medium transition-colors duration-150",
                  period === currentPeriod()
                    ? "bg-card text-foreground shadow-raised"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {formatPeriod(period)}
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPeriod((p) => addMonths(p, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button size="sm" variant="outline" onClick={handleExportRentRoll} disabled={rentRoll.length === 0}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
          </div>
        ) : activeTab === "arrears" ? (
          <Button size="sm" variant="outline" onClick={handleExportArrears} disabled={arrears.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Export Arrears CSV
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleExportPayments} disabled={payments.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Export Payments CSV
          </Button>
        )
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rent-roll">Monthly Rent Roll</TabsTrigger>
          <TabsTrigger value="arrears">
            Arrears & Overdue {arrears.length > 0 && `(${arrears.length})`}
          </TabsTrigger>
          <TabsTrigger value="payments">Payment Ledger</TabsTrigger>
          <TabsTrigger value="export">Data Exports</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Monthly Rent Roll ────────────────────────────────── */}
        <TabsContent value="rent-roll" className="mt-4 space-y-4">
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <div className="stat-label">Expected Rent</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {formatMoney(rentRollTotals.charged, settings.currency)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{rentRollTotals.count} active units</div>
            </Card>

            <Card className="p-4">
              <div className="stat-label">Cash applied</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-success">
                {formatMoney(rentRollTotals.collected, settings.currency)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{collectionRate}% rent settlement rate</div>
            </Card>

            <Card className="p-4">
              <div className="stat-label">Credit applied</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatMoney(rentRollTotals.credited, settings.currency)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="stat-label">Outstanding Balance</div>
              <div className={cn("mt-1 text-xl font-semibold tabular-nums", rentRollTotals.outstanding > 0 ? "text-warning" : "text-foreground")}>
                {formatMoney(rentRollTotals.outstanding, settings.currency)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="stat-label">Overdue Rent</div>
              <div className={cn("mt-1 text-xl font-semibold tabular-nums", rentRollTotals.overdue > 0 ? "text-destructive" : "text-foreground")}>
                {formatMoney(rentRollTotals.overdue, settings.currency)}
              </div>
            </Card>
          </section>

          {rentRollLoading ? (
            <Card className="divide-y divide-border overflow-hidden" role="status" aria-label="Loading tenants">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex h-11 items-center gap-4 px-3" aria-hidden>
                <div className="h-2.5 w-32 animate-pulse rounded-full bg-muted" />
                <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
                <div className="ml-auto h-2.5 w-16 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </Card>
          ) : rentRoll.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              No rent records generated for {formatPeriod(period)}.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property · Unit</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Charged</TableHead>
                    <TableHead className="text-right">Cash applied</TableHead>
                    <TableHead className="text-right">Credit applied</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rentRoll.map((r) => {
                    const balance = r.status === "waived" ? 0 : Math.max(0, r.amount - r.amount_paid - r.amount_credited);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{r.property_name}</div>
                          <div className="text-xs text-muted-foreground">{r.unit_name}</div>
                        </TableCell>
                        <TableCell>
                          {r.tenant_name ? (
                            <div>
                              <div className="text-sm font-medium">{r.tenant_name}</div>
                              {r.tenant_phone && (
                                <div className="text-xs text-muted-foreground">{r.tenant_phone}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Vacant</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(r.due_date)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatMoney(r.amount, settings.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success font-medium">
                          {formatMoney(r.amount_paid, settings.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(r.amount_credited, settings.currency)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold", balance > 0 ? "text-warning" : "text-foreground")}>
                          {formatMoney(balance, settings.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.status === "paid"
                                ? "neutral"
                                : r.status === "overdue"
                                ? "destructive"
                                : "secondary"
                            }
                            className="capitalize"
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 2: Arrears & Aging ──────────────────────────────────── */}
        <TabsContent value="arrears" className="mt-4 space-y-4">
          <Card className="p-4 border-l-4 border-l-destructive flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" /> Total Arrears in Portfolio
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Outstanding balances past their due date requiring collection.
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-destructive">
                {formatMoney(totalOverdue, settings.currency)}
              </div>
              <div className="text-xs text-muted-foreground">{arrears.length} unpaid charges</div>
            </div>
          </Card>

          {arrearsLoading ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
              Loading arrears…
            </Card>
          ) : arrears.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto h-8 w-8 text-teal-700 mb-2" />
              <p className="font-semibold text-foreground">Zero Arrears!</p>
              <p className="text-xs mt-1">All tenants are fully paid up to date.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property · Unit</TableHead>
                    <TableHead>Tenant & Contact</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Days Overdue</TableHead>
                    <TableHead className="text-right">Amount Billed</TableHead>
                    <TableHead className="text-right">Cash applied</TableHead>
                    <TableHead className="text-right">Credit applied</TableHead>
                    <TableHead className="text-right">Outstanding Arrears</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arrears.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{a.property_name}</div>
                        <div className="text-xs text-muted-foreground">{a.unit_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{a.tenant_name || "—"}</div>
                        {a.tenant_phone && (
                          <a
                            href={`tel:${a.tenant_phone}`}
                            className="text-xs text-teal-700 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <PhoneCall className="h-3 w-3" /> {a.tenant_phone}
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(a.due_date)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-destructive-tint px-2 py-0.5 text-xs font-semibold text-destructive">
                          {a.days_overdue} days
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatMoney(a.amount, settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatMoney(a.amount_paid, settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatMoney(a.amount_credited, settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-destructive">
                        {formatMoney(a.balance, settings.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 3: Payment Ledger ───────────────────────────────────── */}
        <TabsContent value="payments" className="mt-4 space-y-4">
          {paymentsLoading ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
              Loading payment history…
            </Card>
          ) : payments.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              No payments recorded yet.
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Property · Unit</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Method & Ref</TableHead>
                    <TableHead className="text-right">Cash received</TableHead>
                    <TableHead className="text-right">Applied to charge</TableHead>
                    <TableHead className="text-right">Excess credit</TableHead>
                    <TableHead className="text-right">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        KTR-{String(p.id).padStart(5, "0")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(p.paid_at)}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{p.property_name}</div>
                        <div className="text-xs text-muted-foreground">{p.unit_name}</div>
                      </TableCell>
                      <TableCell className="text-sm">{p.tenant_name || "—"}</TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold uppercase">{p.method}</div>
                        {p.reference && (
                          <div className="text-xs font-mono text-muted-foreground truncate max-w-[140px]">
                            {p.reference}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-success text-sm">
                        {formatMoney(p.amount, settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatMoney(p.applied_amount, settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatMoney(Math.max(0, p.amount - p.applied_amount), settings.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                          onClick={() => setReceiptPaymentId(p.id)}
                        >
                          <Receipt className="mr-1 h-3.5 w-3.5" /> View Receipt
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 4: Data Exports ─────────────────────────────────────── */}
        <TabsContent value="export" className="mt-4 space-y-4">
          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-base font-semibold">Download Portfolio Records</h2>
              <p className="text-xs text-muted-foreground">
                Export your verified property management data in standard CSV format for accounting, banking, or archival.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border bg-muted/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-teal-700 mb-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    <h3 className="font-semibold text-sm text-foreground">Monthly Rent Roll</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Full charges, collected amounts, and remaining balances for {formatPeriod(period)}.
                  </p>
                </div>
                <Button size="sm" onClick={handleExportRentRoll} disabled={rentRoll.length === 0} className="w-full">
                  <Download className="mr-1.5 h-4 w-4" /> Export Rent Roll
                </Button>
              </Card>

              <Card className="p-4 border bg-muted/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-destructive mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    <h3 className="font-semibold text-sm text-foreground">Arrears & Defaulters</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    All unpaid charges past due date with tenant contact details and days overdue.
                  </p>
                </div>
                <Button size="sm" onClick={handleExportArrears} disabled={arrears.length === 0} variant="outline" className="w-full">
                  <Download className="mr-1.5 h-4 w-4" /> Export Arrears List
                </Button>
              </Card>

              <Card className="p-4 border bg-muted/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-teal-700 mb-2">
                    <Receipt className="h-5 w-5" />
                    <h3 className="font-semibold text-sm text-foreground">Payment History</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Every transaction receipt with M-Pesa / Bank reference codes and timestamps.
                  </p>
                </div>
                <Button size="sm" onClick={handleExportPayments} disabled={payments.length === 0} variant="outline" className="w-full">
                  <Download className="mr-1.5 h-4 w-4" /> Export Payments
                </Button>
              </Card>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <ReceiptDialog
        paymentId={receiptPaymentId}
        open={receiptPaymentId !== null}
        onOpenChange={(o) => !o && setReceiptPaymentId(null)}
      />
    </PageShell>
  );
}
