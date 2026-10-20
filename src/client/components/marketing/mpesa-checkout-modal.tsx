import { useState, useEffect, useRef } from "react";
import {
  X,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
  Lock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import type { User } from "../../types";
import { PAID_PLANS, type PaidPlanId } from "../../../shared/plan-config";

export interface MpesaCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: PaidPlanId;
  currentUser?: User | null;
  onSuccess: (user: User, token?: string) => void;
}

export function MpesaCheckoutModal({
  isOpen,
  onClose,
  planId,
  currentUser,
  onSuccess,
}: MpesaCheckoutModalProps) {
  const [activePlanId, setActivePlanId] = useState<PaidPlanId>(planId);
  const plan = PAID_PLANS[activePlanId];

  useEffect(() => {
    setActivePlanId(planId);
  }, [planId]);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(currentUser?.phone || "");

  // Processing states
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const [simulationAvailable, setSimulationAvailable] = useState(false);
  const [status, setStatus] = useState<"idle" | "waiting" | "success" | "failed">("idle");
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (currentUser?.phone) {
      setPhone(currentUser.phone);
    }
  }, [currentUser]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  async function handleInitiatePayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!phone || phone.trim().length < 9) {
      setError("Please enter a valid Safaricom phone number (e.g., 0712345678).");
      return;
    }

    if (!currentUser) {
      if (!email || !email.includes("@")) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!password || password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    setSubmitting(true);
    setStatus("waiting");
    setStatusMessage("Sending M-Pesa STK Push prompt to your phone...");

    try {
      const res = await fetch("/api/mpesa/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          amount: plan.priceKes,
          plan: activePlanId,
          purpose: "subscription",
          name: currentUser?.name || name.trim() || undefined,
          email: currentUser?.email || email.trim().toLowerCase() || undefined,
          password: !currentUser ? password : undefined,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        checkout_request_id: string;
        poll_token: string;
        customer_message?: string;
        simulated?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate M-Pesa checkout.");
      }

      setCheckoutId(data.checkout_request_id);
      setPollToken(data.poll_token);
      setSimulationAvailable(data.simulated === true);
      setStatusMessage(data.customer_message || "STK Push sent! Please check your phone and enter your M-Pesa PIN.");

      // Start polling
      startPolling(data.checkout_request_id, data.poll_token);
    } catch (err) {
      setError((err as Error).message);
      setStatus("failed");
    } finally {
      setSubmitting(false);
    }
  }

  function startPolling(id: string, token: string) {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/mpesa/query/${encodeURIComponent(id)}`, {
          headers: { "X-Payment-Token": token },
        });
        const data = (await res.json()) as {
          status: string;
          mpesa_receipt?: string;
          result_desc?: string;
          user?: User;
          token?: string;
        };

        if (data.status === "completed") {
          if (pollIntervalRef.current) {
            window.clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setStatus("success");
          setReceiptNumber(data.mpesa_receipt || null);
          setStatusMessage("Payment successfully confirmed! Your subscription is active.");

          // If session or user is returned, trigger success handler
          if (data.user) {
            setTimeout(() => {
              onSuccess(data.user!, data.token);
            }, 1200);
          }
        } else if (data.status === "failed") {
          if (pollIntervalRef.current) {
            window.clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setStatus("failed");
          setError(data.result_desc || "Payment was cancelled or timed out.");
        }
      } catch {
        // Continue polling
      }
    }, 2500);
  }

  async function handleSimulateApproval() {
    if (!checkoutId || !pollToken) return;
    try {
      setStatusMessage("Simulating Daraja payment confirmation...");
      const res = await fetch(`/api/mpesa/query/${encodeURIComponent(checkoutId)}?simulate=true`, {
        headers: { "X-Payment-Token": pollToken },
      });
      const data = (await res.json()) as {
        status: string;
        mpesa_receipt?: string;
        user?: User;
        token?: string;
      };

      if (data.status === "completed") {
        if (pollIntervalRef.current) {
          window.clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setStatus("success");
        setReceiptNumber(data.mpesa_receipt || null);
        setStatusMessage("Sandbox payment simulated successfully! Activating account...");

        if (data.user) {
          setTimeout(() => {
            onSuccess(data.user!, data.token);
          }, 1200);
        }
      }
    } catch (err) {
      setError("Simulation failed: " + (err as Error).message);
    }
  }

  function handleReset() {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setStatus("idle");
    setError(null);
    setCheckoutId(null);
    setPollToken(null);
    setSimulationAvailable(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-stone-200">
        {/* Header with M-Pesa branding */}
        <div className="bg-[#0c2e25] px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30 font-bold text-sm">
              KES
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">M-Pesa Subscription Checkout</h2>
              <p className="text-xs text-stone-300">{currentUser ? "Renew or change your KodiTrack plan" : "Create your KodiTrack account"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Plan Selector Pills */}
          {(status === "idle" || status === "failed") && (
            <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl bg-stone-100 p-1">
              {Object.values(PAID_PLANS).map((info) => {
                const active = activePlanId === info.id;
                return (
                  <button
                    key={info.id}
                    type="button"
                    onClick={() => setActivePlanId(info.id)}
                    className={`rounded-lg py-2 px-1 text-center transition-all ${
                      active
                        ? "bg-white text-stone-900 font-bold shadow-xs"
                        : "text-stone-600 hover:text-stone-900 font-medium text-xs"
                    }`}
                  >
                    <div className="text-xs leading-none">{info.name}</div>
                    <div className={`text-[11px] mt-0.5 ${active ? "text-[#155e4f] font-semibold" : "text-stone-400"}`}>
                      KSh {info.priceKes.toLocaleString("en-KE")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Plan Summary Card */}
          <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#155e4f]">
                  Selected Tier
                </span>
                <h3 className="text-base font-bold text-stone-900">{plan.name}</h3>
                <p className="text-xs text-stone-600">{plan.properties} properties · {plan.units} units</p>
                <p className="mt-1 text-xs text-stone-500">{plan.description}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-extrabold text-[#155e4f]">
                  KSh {plan.priceKes.toLocaleString("en-KE")}
                </div>
                <div className="text-[11px] text-stone-500 font-medium">One month · manual renewal</div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <div>{error}</div>
            </div>
          )}

          {/* STATE: Waiting for PIN on phone */}
          {status === "waiting" && (
            <div className="space-y-5 text-center py-4">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-[#155e4f]">
                <Smartphone className="h-8 w-8 animate-bounce" />
                <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-30" />
              </div>

              <div>
                <h4 className="text-base font-bold text-stone-900">Check Your Phone</h4>
                <p className="text-xs text-stone-600 mt-1 max-w-sm mx-auto leading-relaxed">
                  An M-Pesa STK Push has been sent to{" "}
                  <strong className="text-stone-900 font-mono">{phone}</strong> for{" "}
                  <strong className="text-stone-900">KSh {plan.priceKes.toLocaleString("en-KE")}</strong>.
                  Please enter your M-Pesa PIN on your phone to complete.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                <span>Waiting for Safaricom Daraja confirmation...</span>
              </div>

              {simulationAvailable && (
                <div className="pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={handleSimulateApproval}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors shadow-sm"
                  >
                    <Sparkles className="h-4 w-4 text-amber-600" />
                    <span>Simulate payment (development only)</span>
                  </button>
                  <p className="text-[10px] text-stone-400 mt-1">
                    This test payment does not contact Safaricom or move money.
                  </p>
                </div>
              )}

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800"
                >
                  <RefreshCw className="h-3 w-3" />
                  Try a different phone number
                </button>
              </div>
            </div>
          )}

          {/* STATE: Success */}
          {status === "success" && (
            <div className="space-y-5 text-center py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-9 w-9" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-stone-900">Payment Confirmed!</h4>
                <p className="text-xs text-stone-600 mt-1 max-w-sm mx-auto">
                  Your KodiTrack <strong className="text-stone-900">{plan.name}</strong> plan is active for one month.
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-700 space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">M-Pesa Receipt:</span>
                  <span className="font-mono font-bold text-stone-900">{receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Amount Paid:</span>
                  <span className="font-bold text-stone-900">KSh {plan.priceKes.toLocaleString("en-KE")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Unit Limit:</span>
                  <span className="font-bold text-emerald-700">{plan.units} units · {plan.properties} properties</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-medium text-emerald-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Redirecting to your secure dashboard...</span>
              </div>
            </div>
          )}

          {/* STATE: Form Input */}
          {(status === "idle" || status === "failed") && (
            <form onSubmit={handleInitiatePayment} className="space-y-4">
              {!currentUser && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., James Brian"
                      className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#155e4f] focus:ring-1 focus:ring-[#155e4f] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g., james@example.com"
                      className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#155e4f] focus:ring-1 focus:ring-[#155e4f] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Create Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#155e4f] focus:ring-1 focus:ring-[#155e4f] outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Safaricom M-Pesa Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712 345 678 or 254..."
                    className="w-full rounded-xl border border-stone-300 pl-9 pr-20 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-[#155e4f] focus:ring-1 focus:ring-[#155e4f] outline-none font-mono"
                  />
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                      M-Pesa
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  You will receive a PIN prompt on this phone to authorize payment.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#155e4f] hover:bg-[#0f4a3e] text-white py-3 px-4 font-semibold text-sm shadow-md shadow-emerald-900/10 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending STK Push...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 text-emerald-200" />
                      <span>Pay KSh {plan.priceKes.toLocaleString("en-KE")} via M-Pesa</span>
                      <ArrowRight className="h-4 w-4 text-emerald-200" />
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] text-stone-500 pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Secured via Safaricom Daraja API v2. Cancel anytime.</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
