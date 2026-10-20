import { useEffect, useState } from "react";
import { api } from "@/api";
import { formatMoney, formatDate } from "@/lib/utils";
import { useApp } from "@/context";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Printer, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";

export interface ReceiptData {
  id: number;
  amount: number;
  applied_amount: number;
  paid_at: string;
  method: string;
  reference: string | null;
  notes: string | null;
  charge_id: number;
  charge_amount: number;
  charge_amount_paid: number;
  charge_amount_credited: number;
  charge_period: string;
  due_date: string;
  unit_name: string;
  property_name: string;
  property_address: string | null;
  property_city: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_email: string | null;
}

interface ReceiptDialogProps {
  paymentId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptDialog({ paymentId, open, onOpenChange }: ReceiptDialogProps) {
  const { settings, user, setError } = useApp();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !paymentId) {
      setReceipt(null);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const data = await api<{ receipt: ReceiptData }>("GET", `/api/payments/${paymentId}/receipt`);
        setReceipt(data.receipt);
      } catch (error) {
        setReceipt(null);
        setError((error as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, paymentId]);

  function handlePrint() {
    window.print();
  }

  const receiptNo = receipt ? `KTR-${String(receipt.id).padStart(5, "0")}` : "—";
  const remainingBalance = receipt ? Math.max(0, receipt.charge_amount - receipt.charge_amount_paid - receipt.charge_amount_credited) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden sm:rounded-xl">
        <DialogHeader className="p-4 border-b bg-muted/40">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">Payment Receipt</DialogTitle>
            <span className="text-xs font-mono text-muted-foreground mr-6">{receiptNo}</span>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading receipt…
          </div>
        ) : !receipt ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Receipt details could not be loaded.
          </div>
        ) : (
          <div id="koditrack-printable-receipt" className="p-6 bg-card text-foreground space-y-6">
            {/* Header with KodiTrack brand & Status stamp */}
            <div className="flex items-start justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white shadow-sm">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">KodiTrack</h2>
                  <p className="text-xs text-muted-foreground">Rental Management Receipt</p>
                </div>
              </div>

              <div className="text-right">
                <div className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                  <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" />
                  <span>RECEIVED</span>
                </div>
                <div className="mt-1 text-xs font-mono text-muted-foreground">
                  Receipt: {receiptNo}
                </div>
              </div>
            </div>

            {/* Parties: Landlord and Tenant */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-semibold text-muted-foreground uppercase tracking-wider">ISSUED BY</span>
                <p className="mt-1 font-medium text-foreground text-sm">{user?.name || "Property Management"}</p>
                <p className="text-muted-foreground">{receipt.property_name}</p>
                <p className="text-muted-foreground">
                  {[receipt.property_address, receipt.property_city].filter(Boolean).join(", ")}
                </p>
              </div>

              <div>
                <span className="font-semibold text-muted-foreground uppercase tracking-wider">RECEIVED FROM</span>
                <p className="mt-1 font-medium text-foreground text-sm">{receipt.tenant_name || "Tenant"}</p>
                <p className="text-muted-foreground">Unit: {receipt.unit_name}</p>
                {receipt.tenant_phone && <p className="text-muted-foreground">Tel: {receipt.tenant_phone}</p>}
              </div>
            </div>

            {/* Payment Details Table */}
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground grid grid-cols-3">
                <span>DESCRIPTION</span>
                <span>METHOD / REF</span>
                <span className="text-right">AMOUNT</span>
              </div>
              <div className="divide-y text-xs">
                <div className="px-4 py-3 grid grid-cols-3 items-center">
                  <div>
                    <span className="font-medium text-foreground">Rent Payment</span>
                    <p className="text-muted-foreground text-[11px]">Period: {receipt.charge_period}</p>
                  </div>
                  <div>
                    <span className="font-medium uppercase text-foreground">{receipt.method}</span>
                    {receipt.reference && (
                      <p className="font-mono text-muted-foreground text-[11px] truncate">{receipt.reference}</p>
                    )}
                  </div>
                  <div className="text-right font-semibold text-foreground text-sm">
                    {formatMoney(receipt.amount, settings.currency)}
                  </div>
                </div>
              </div>
            </div>

            {/* Totals & Outstanding */}
            <div className="space-y-1.5 text-xs border-t pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date of Payment:</span>
                <span className="font-medium">{formatDate(receipt.paid_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period Rent Total:</span>
                <span>{formatMoney(receipt.charge_amount, settings.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash applied to this period:</span>
                <span>{formatMoney(receipt.charge_amount_paid, settings.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit applied to this period:</span>
                <span>{formatMoney(receipt.charge_amount_credited, settings.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">This receipt applied to selected charge:</span>
                <span>{formatMoney(receipt.applied_amount, settings.currency)}</span>
              </div>
              {receipt.amount > receipt.applied_amount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Excess recorded as lease credit:</span>
                  <span>{formatMoney(receipt.amount - receipt.applied_amount, settings.currency)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t text-sm font-semibold">
                <span>Remaining Period Balance:</span>
                <span className={remainingBalance > 0 ? "text-amber-600 font-bold" : "text-teal-700 font-bold"}>
                  {formatMoney(remainingBalance, settings.currency)}
                </span>
              </div>
            </div>

            {/* Notes if present */}
            {receipt.notes && (
              <div className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Notes: </span>
                {receipt.notes}
              </div>
            )}

            {/* Footer watermark */}
            <div className="flex items-center justify-between border-t pt-4 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-700" />
                <span>Generated by KodiTrack Rental System</span>
              </div>
              <div>{new Date().toLocaleDateString()}</div>
            </div>
          </div>
        )}

        <DialogFooter className="p-4 border-t bg-muted/20">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={!receipt}
            className="bg-teal-700 hover:bg-teal-800"
          >
            <Printer className="mr-1.5 h-4 w-4" /> Print / Save PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
