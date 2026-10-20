import { useEffect, useState, useRef } from "react";
import { useApp } from "@/context";
import { api } from "@/api";
import { formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Receipt, Smartphone, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { ReceiptDialog } from "./receipt-dialog";
import type { Payment, PaymentMethod, RentCharge } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: RentCharge | null;
  onSaved?: () => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Cheque" },
  { value: "credit", label: "Card" },
  { value: "other", label: "Other" },
];

export function PaymentDialog({ open, onOpenChange, charge, onSaved }: Props) {
  const app = useApp();
  const [amount, setAmount] = useState("0");
  /** The payment awaiting confirmation — its id is the open state. */
  const [confirming, setConfirming] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("mpesa");
  const [paidAt, setPaidAt] = useState(toIsoDate(new Date()));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Payment[]>([]);
  const [receiptPaymentId, setReceiptPaymentId] = useState<number | null>(null);

  // M-Pesa STK Push states
  const [stkPhone, setStkPhone] = useState("");
  const [stkSubmitting, setStkSubmitting] = useState(false);
  const [stkStatus, setStkStatus] = useState<"idle" | "waiting" | "success" | "failed">("idle");
  const [stkCheckoutId, setStkCheckoutId] = useState<string | null>(null);
  const [stkPollToken, setStkPollToken] = useState<string | null>(null);
  const [stkSimulationAvailable, setStkSimulationAvailable] = useState(false);
  const [stkMessage, setStkMessage] = useState("");
  const stkPollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (stkPollRef.current) clearInterval(stkPollRef.current);
    };
  }, []);

  async function reloadPayments() {
    if (!charge) return;
    try {
      const data = await api<{ payments: Payment[] }>("GET", `/api/rent-charges/${charge.id}/payments`);
      setHistory(data.payments);
    } catch {}
  }

  useEffect(() => {
    if (!open || !charge) return;
    const remaining = Math.max(0, (charge.amount ?? 0) - (charge.amount_paid ?? 0) - (charge.amount_credited ?? 0));
    setAmount(String(remaining));
    setMethod("mpesa");
    setPaidAt(toIsoDate(new Date()));
    setReference("");
    setNotes("");
    setStkPhone("");
    setStkStatus("idle");
    setStkMessage("");
    setStkCheckoutId(null);
    setStkPollToken(null);
    setStkSimulationAvailable(false);
    reloadPayments();
  }, [open, charge]);

  async function handleSendStkPush() {
    if (!charge) return;
    const a = parseFloat(amount);
    if (!Number.isFinite(a) || a <= 0) {
      app.setError("Please enter a valid payment amount.");
      return;
    }
    if (!stkPhone || stkPhone.trim().length < 9) {
      app.setError("Please enter the tenant's Safaricom phone number.");
      return;
    }
    setStkSubmitting(true);
    setStkStatus("waiting");
    setStkMessage("Sending prompt to tenant's phone...");

    try {
      const res = await fetch("/api/mpesa/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: stkPhone.trim(),
          amount: a,
          charge_id: charge.id,
          purpose: "rent",
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        checkout_request_id: string;
        poll_token: string;
        customer_message?: string;
        simulated?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Failed to send STK push.");
      setStkCheckoutId(data.checkout_request_id);
      setStkPollToken(data.poll_token);
      setStkSimulationAvailable(data.simulated === true);
      setStkMessage(data.customer_message || "Prompt sent to tenant phone! Waiting for PIN...");

      if (stkPollRef.current) clearInterval(stkPollRef.current);
      stkPollRef.current = window.setInterval(async () => {
        try {
          const qres = await fetch(`/api/mpesa/query/${encodeURIComponent(data.checkout_request_id)}`, {
            headers: { "X-Payment-Token": data.poll_token },
          });
          const qdata = (await qres.json()) as {
            status: string;
            mpesa_receipt?: string;
            result_desc?: string;
          };
          if (qdata.status === "completed") {
            if (stkPollRef.current) clearInterval(stkPollRef.current);
            setStkStatus("success");
            setStkMessage("Payment completed successfully!");
            setReference(qdata.mpesa_receipt || "");
            await reloadPayments();
            onSaved?.();
          } else if (qdata.status === "failed") {
            if (stkPollRef.current) clearInterval(stkPollRef.current);
            setStkStatus("failed");
            setStkMessage(qdata.result_desc || "Payment failed or cancelled.");
          }
        } catch {}
      }, 2500);
    } catch (err) {
      setStkStatus("failed");
      setStkMessage((err as Error).message);
    } finally {
      setStkSubmitting(false);
    }
  }

  async function handleSimulateRentStk() {
    if (!stkCheckoutId || !stkPollToken) return;
    try {
      const qres = await fetch(`/api/mpesa/query/${encodeURIComponent(stkCheckoutId)}?simulate=true`, {
        headers: { "X-Payment-Token": stkPollToken },
      });
      const qdata = (await qres.json()) as {
        status: string;
        mpesa_receipt?: string;
        result_desc?: string;
      };
      if (qdata.status === "completed") {
        if (stkPollRef.current) clearInterval(stkPollRef.current);
        setStkStatus("success");
        setStkMessage("Payment simulated successfully!");
        setReference(qdata.mpesa_receipt || "");
        await reloadPayments();
        onSaved?.();
      }
    } catch (err) {
      setStkMessage("Simulation failed: " + (err as Error).message);
    }
  }

  async function save() {
    if (!charge) return;
    const a = parseFloat(amount);
    if (!Number.isFinite(a) || a <= 0) return;
    setSaving(true);
    try {
      await app.recordPayment({
        charge_id: charge.id,
        amount: a,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        paid_at: paidAt,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(id: number) {
    try {
      await api("DELETE", `/api/payments/${id}`);
      setHistory((prev) => prev.filter((p) => p.id !== id));
      onSaved?.();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  const pending = history.find((p) => p.id === confirming) ?? null;

  if (!charge) return null;
  const remaining = Math.max(0, (charge.amount ?? 0) - (charge.amount_paid ?? 0) - (charge.amount_credited ?? 0));

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="font-medium">
            {charge.property_name} · {charge.unit_name}
          </div>
          <div className="text-xs text-muted-foreground">
            {charge.tenant_first_name} {charge.tenant_last_name} · Due {formatDate(charge.due_date)} · {formatMoney(charge.amount, app.settings.currency)} charged
          </div>
          <div className="mt-1 text-xs">
            Cash applied: <span className="font-medium tabular-nums">{formatMoney(charge.amount_paid, app.settings.currency)}</span> ·
            Credit applied: <span className="font-medium tabular-nums">{formatMoney(charge.amount_credited, app.settings.currency)}</span> ·
            Remaining: <span className="font-medium tabular-nums">{formatMoney(remaining, app.settings.currency)}</span>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pay-amount">Amount</Label>
              <Input id="pay-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-date">Paid on</Label>
              <Input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          {parseFloat(amount) > remaining && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The excess {formatMoney(parseFloat(amount) - remaining, app.settings.currency)} will be recorded as a
              rent credit and automatically applied to the oldest unpaid charge on this lease. Any leftover stays
              visible as available credit.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-ref">Reference</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="M-Pesa code (e.g. QKH48...) or Bank Ref" />
            </div>
          </div>

          {method === "mpesa" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-emerald-700" />
                  Direct M-Pesa STK Push
                </span>
                <span className="text-[10px] uppercase font-bold text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded">
                  Safaricom Daraja
                </span>
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Tenant phone e.g. 0712345678"
                  value={stkPhone}
                  onChange={(e) => setStkPhone(e.target.value)}
                  className="text-xs h-8 bg-white"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={stkSubmitting || stkStatus === "waiting"}
                  onClick={handleSendStkPush}
                  className="h-8 shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white text-xs px-3"
                >
                  {stkSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send STK Prompt"}
                </Button>
              </div>
              {stkStatus === "waiting" && (
                <div className="flex flex-col gap-1.5 pt-1 text-emerald-800">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                    <span>{stkMessage}</span>
                  </div>
                  {stkSimulationAvailable && (
                    <button
                      type="button"
                      onClick={handleSimulateRentStk}
                      className="text-left text-[11px] text-amber-800 underline hover:text-amber-900 font-semibold"
                    >
                      Simulate payment (development only)
                    </button>
                  )}
                </div>
              )}
              {stkStatus === "success" && (
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold pt-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{stkMessage}</span>
                </div>
              )}
              {stkStatus === "failed" && (
                <div className="text-rose-600 text-[11px] pt-1">
                  {stkMessage}
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-2">
            <div className="section-label mb-1.5">Past payments</div>
            <ul className="divide-y divide-border overflow-hidden rounded-md shadow-edge">
              {history.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium tabular-nums">{formatMoney(p.amount, app.settings.currency)}</span>
                    <span className="text-muted-foreground"> · {formatDate(p.paid_at)} · {p.method}</span>
                    {p.reference && <span className="text-muted-foreground font-mono text-xs"> · {p.reference}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                      onClick={() => setReceiptPaymentId(p.id)}
                    >
                      <Receipt className="mr-1 h-3.5 w-3.5" /> Receipt
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground transition-colors duration-150 hover:text-destructive"
                      onClick={() => setConfirming(p.id)}
                      aria-label={`Remove the ${formatMoney(p.amount, app.settings.currency)} payment from ${formatDate(p.paid_at)}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button type="button" onClick={save} disabled={saving || parseFloat(amount) <= 0}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {pending ? (
        <ConfirmDelete
          open
          onOpenChange={(o) => !o && setConfirming(null)}
          title={`Remove the ${formatMoney(pending.amount, app.settings.currency)} payment?`}
          description="The payment and any rent credit created from it will be reversed. Charges paid using that credit will reopen."
          confirmLabel="Remove payment"
          onConfirm={() => {
            const id = pending.id;
            setConfirming(null);
            deletePayment(id);
          }}
        />
      ) : null}

      <ReceiptDialog
        paymentId={receiptPaymentId}
        open={receiptPaymentId !== null}
        onOpenChange={(o) => !o && setReceiptPaymentId(null)}
      />
    </>
  );
}
