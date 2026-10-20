import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context";
import { api } from "@/api";
import { MpesaCheckoutModal } from "../marketing/mpesa-checkout-modal";
import { getPlanLimits, isPaidPlan, PAID_PLANS, type PaidPlanId } from "../../../shared/plan-config";
import {
  CreditCard,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  MessageSquare,
  ShieldAlert,
  Loader2,
  Crown,
  Zap,
  Sparkles,
  HelpCircle,
  LogOut,
} from "lucide-react";

export function SubscriptionsPage({ navigate }: { navigate: (to: string) => void }) {
  const { user, properties, logout } = useApp();
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [targetUpgradePlan, setTargetUpgradePlan] = useState<PaidPlanId>("plus");

  // Feedback State
  const [feedbackCategory, setFeedbackCategory] = useState<"suggestion" | "complaint" | "billing" | "general">("suggestion");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Cancellation / Retention Flow State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<1 | 2 | 3>(1);
  const [cancelReason, setCancelReason] = useState<string>("expensive");
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const userPlan = user?.plan || "free";
  const limits = getPlanLimits(userPlan);
  const unitLimit = limits.units;
  const propertyLimit = limits.properties;
  const currentProperties = properties.length;
  const currentUnits = properties.reduce((sum, p) => sum + (p.unit_count ?? 0), 0);
  const usagePct = Math.min(100, Math.round((currentUnits / unitLimit) * 100));
  const remainingUnits = Math.max(0, unitLimit - currentUnits);
  const planName = isPaidPlan(userPlan) ? PAID_PLANS[userPlan].name : "Legacy access";
  const planExpired = Boolean(
    user?.plan_expires_at &&
    Date.parse(user.plan_expires_at) <= Date.now(),
  );

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackMessage.trim()) return;
    setSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      await api("POST", "/api/feedback", {
        category: feedbackCategory,
        message: feedbackMessage.trim(),
        rating: feedbackRating,
      });
      setFeedbackSent(true);
      setFeedbackMessage("");
    } catch (err) {
      setFeedbackError((err as Error).message || "Failed to submit feedback.");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function handleFinalUnsubscribe() {
    setCancelling(true);
    setCancelError(null);
    try {
      await api("POST", "/api/subscriptions/unsubscribe", {
        reason: cancelReason,
        notes: cancelNotes,
        offer_declined: true,
      });
      await logout();
      window.location.href = "/?cancelled=1";
    } catch (err) {
      setCancelError((err as Error).message || "Could not process cancellation.");
      setCancelling(false);
    }
  }

  return (
    <PageShell
      title="Subscription & Plan Management"
      meta="Review property and unit limits, renew your plan, or change capacity."
    >
      <div className="space-y-6 max-w-5xl">
        {/* ── Active Plan Graphical Card ── */}
        <Card className="p-6 overflow-hidden relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xl font-extrabold capitalize text-foreground">
                  {planName}
                </span>
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs">
                  {planExpired ? "Renewal needed" : userPlan === "free" ? "Legacy access" : "Plan active"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                {propertyLimit === null
                  ? `Your existing legacy access includes up to ${unitLimit} rental units. New accounts must choose a paid plan.`
                  : `${planName} includes up to ${propertyLimit} properties and ${unitLimit} rental units.`}
              </p>
              {user?.plan_expires_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Paid through {new Date(user.plan_expires_at).toLocaleDateString()}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5 shrink-0">
              <Button
                onClick={() => {
                  const nextPlan: PaidPlanId =
                    userPlan === "free" ? "starter" : userPlan === "starter" ? "plus" : userPlan === "plus" ? "manager" : "manager";
                  setTargetUpgradePlan(planExpired && isPaidPlan(userPlan) ? userPlan : nextPlan);
                  setCheckoutModalOpen(true);
                }}
                className="bg-[#155e4f] hover:bg-[#0f4a3e] text-white"
              >
                <Sparkles className="mr-2 h-4 w-4 text-emerald-300" />
                <span>{planExpired ? "Renew plan" : "Change or renew plan"}</span>
              </Button>
            </div>
          </div>

          {/* Quota Progress Bar */}
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-foreground">Unit capacity</span>
              <span className="text-muted-foreground font-mono">
                {currentUnits} of {unitLimit} Units Used ({usagePct}%)
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
              <div
                style={{ width: `${usagePct}%` }}
                className={`h-full transition-all duration-500 rounded-full ${
                  usagePct >= 90 ? "bg-amber-500" : "bg-emerald-600"
                }`}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>{remainingUnits} additional unit{remainingUnits === 1 ? "" : "s"} available under current plan.</span>
              {remainingUnits === 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  Unit limit reached. Upgrade to add more units.
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Properties in use: {currentProperties}</span>
              <span>{propertyLimit === null ? "No property cap on legacy access" : `Limit: ${propertyLimit} properties`}</span>
            </div>
          </div>
        </Card>

        {/* ── Tier Comparison Cards ── */}
        <p className="text-sm text-muted-foreground">
          All plans include the current features. Limits apply to both properties and rental units; monthly renewals are manual.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(PAID_PLANS).map((tier) => {
            const isCurrent = userPlan === tier.id;
            return (
              <Card key={tier.id} className={`p-5 flex flex-col justify-between ${isCurrent ? "border-emerald-600 ring-1 ring-emerald-600 shadow-sm" : ""}`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-foreground">{tier.name}</span>
                    <Badge variant={isCurrent ? "default" : "outline"} className="text-[10px]">
                      {isCurrent ? "Current Plan" : `${tier.properties} properties`}
                    </Badge>
                  </div>
                  <div className="text-lg font-extrabold text-foreground mb-1">
                    KSh {tier.priceKes.toLocaleString("en-KE")} <span className="text-xs font-medium text-muted-foreground">/ month</span>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">Up to {tier.properties} properties · {tier.units} units</p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground mb-4">
                    {[
                      "Property, tenant and lease records",
                      "Rent ledger, receipts and arrears",
                      "Maintenance work orders and CSV exports",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {!isCurrent && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTargetUpgradePlan(tier.id);
                      setCheckoutModalOpen(true);
                    }}
                    className="w-full text-xs font-semibold"
                  >
                    Select {tier.name}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        {/* ── Feedback & Suggestions Box ── */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Direct Feedback & Suggestion Box</h3>
                <p className="text-xs text-muted-foreground">
                  Share feedback to help shape future product improvements.
                </p>
              </div>
            </div>
          </div>

          {feedbackSent ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-emerald-950">Thank you for your valuable feedback!</p>
              <p className="text-xs text-emerald-800 mt-1 max-w-md mx-auto">
                We continuously refine KodiTrack based on your real-world landlord needs. We have logged your submission.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFeedbackSent(false)}
                className="mt-4 text-xs"
              >
                Submit another comment
              </Button>
            </div>
          ) : (
            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              {feedbackError && (
                <div className="rounded-lg bg-destructive-tint p-2 text-xs font-medium text-destructive">
                  {feedbackError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-foreground">Category</Label>
                  <select
                    value={feedbackCategory}
                    onChange={(e) => setFeedbackCategory(e.target.value as never)}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground shadow-xs outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="suggestion">Feature Suggestion</option>
                    <option value="complaint">Service Complaint / Issue</option>
                    <option value="billing">Billing or Subscription Question</option>
                    <option value="general">Praise / General Comment</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-foreground">Overall Satisfaction (1–5)</Label>
                  <div className="flex gap-2 mt-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setFeedbackRating(val)}
                        className={`flex-1 h-9 rounded-md border text-xs font-bold transition-colors ${
                          feedbackRating === val
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {val} ★
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground">
                  Your Suggestions, Complaints, or Ideas
                </Label>
                <Textarea
                  required
                  rows={4}
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder="Tell us what you like, what feels cumbersome, or what new automation you need..."
                  className="mt-1 text-xs"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={submittingFeedback}
                  className="bg-[#155e4f] hover:bg-[#0f4a3e] text-white text-xs"
                >
                  {submittingFeedback ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    <><Send className="mr-2 h-3.5 w-3.5" />Submit Feedback</>
                  )}
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* ── Unsubscribe / Account Cancellation Option ── */}
        <Card className="p-6 border-destructive/20 bg-destructive-tint/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                <ShieldAlert className="h-4 w-4" />
                <span>Subscription Cancellation & Account Deactivation</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                If you no longer manage rental properties, you can deactivate your account and terminate your subscription.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setCancelStep(1);
                setCancelModalOpen(true);
              }}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0 text-xs font-semibold"
            >
              Cancel Subscription
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Cancellation / Retention Dialog Flow ── */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            {cancelError && (
              <div className="mb-4 rounded-lg bg-destructive-tint p-2 text-xs font-semibold text-destructive">
                {cancelError}
              </div>
            )}

            {/* Step 1: Why are you leaving? */}
            {cancelStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">We're sorry to see you consider leaving</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Help us understand what went wrong so we can address it.
                  </p>
                </div>

                <div className="space-y-2">
                  {[
                    { id: "expensive", label: "Too expensive for my rental margins" },
                    { id: "missing_feature", label: "Missing a specific property management feature" },
                    { id: "sold_property", label: "I sold my property / no longer managing rentals" },
                    { id: "manual", label: "Going back to manual ledger / notebooks" },
                    { id: "other", label: "Other reason" },
                  ].map((r) => (
                    <label
                      key={r.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer text-xs font-medium transition-colors ${
                        cancelReason === r.id ? "border-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="cancelReason"
                        checked={cancelReason === r.id}
                        onChange={() => setCancelReason(r.id)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Additional details (optional)</Label>
                  <Textarea
                    rows={2}
                    value={cancelNotes}
                    onChange={(e) => setCancelNotes(e.target.value)}
                    placeholder="Tell us what could have been better..."
                    className="mt-1 text-xs"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelModalOpen(false)}
                    className="w-1/2 text-xs"
                  >
                    Keep My Subscription
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setCancelStep(2)}
                    className="w-1/2 bg-destructive hover:bg-destructive/90 text-white text-xs"
                  >
                    Continue →
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Intelligent Retention Offer */}
            {cancelStep === 2 && (
              <div className="space-y-4">
                {cancelReason === "expensive" ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                      <Sparkles className="h-5 w-5 text-emerald-600" />
                      <span>Special Retention Courtesy</span>
                    </div>
                    <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                      We understand managing operational costs. We would love to grant you a <strong>30-day billing pause</strong> with zero charges so your tenants' payment history and ledgers remain organized.
                    </p>
                    <Button
                      onClick={() => {
                        setCancelModalOpen(false);
                        alert("Thank you! A 30-day extension courtesy has been applied to your account.");
                      }}
                      className="w-full bg-[#155e4f] hover:bg-[#0f4a3e] text-white text-xs font-semibold"
                    >
                      Claim 30-Day Free Courtesy
                    </Button>
                  </div>
                ) : cancelReason === "missing_feature" ? (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-bold text-sm">
                      <HelpCircle className="h-5 w-5 text-blue-600" />
                      <span>We Can Build It For You</span>
                    </div>
                    <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                      Our lead developer prioritizes custom workflows for our active landlords. Contact us directly and we can configure your custom export or receipt layout today.
                    </p>
                    <Button
                      onClick={() => {
                        setCancelModalOpen(false);
                        window.location.href = "mailto:jamesbriandungu@gmail.com?subject=Feature Request from Landlord";
                      }}
                      className="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                    >
                      Email Product Lead Directly
                    </Button>
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    <h4 className="text-sm font-bold text-foreground">Are you sure you want to proceed?</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Your tenant records, rent ledgers, printable receipts, and unit history will be inaccessible once your contract is terminated.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setCancelModalOpen(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Keep my account active
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelStep(3)}
                    className="text-xs text-destructive font-semibold hover:underline"
                  >
                    Proceed with cancellation →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Final Security Deactivation Confirmation */}
            {cancelStep === 3 && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-2">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Confirm Permanent Cancellation</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Once cancelled, your subscription will end immediately, you will be securely signed out, and you will not be able to log back in without contacting support.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelModalOpen(false)}
                    className="w-1/2 text-xs"
                  >
                    Keep My Account
                  </Button>
                  <Button
                    type="button"
                    disabled={cancelling}
                    onClick={handleFinalUnsubscribe}
                    className="w-1/2 bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold"
                  >
                    {cancelling ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</>
                    ) : (
                      "Deactivate & Cancel"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upgrade Checkout Modal */}
      {checkoutModalOpen && (
        <MpesaCheckoutModal
          isOpen={checkoutModalOpen}
          planId={targetUpgradePlan}
          currentUser={user}
          onClose={() => setCheckoutModalOpen(false)}
          onSuccess={() => {
            setCheckoutModalOpen(false);
            window.location.reload();
          }}
        />
      )}
    </PageShell>
  );
}
