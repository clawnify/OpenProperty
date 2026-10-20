import { useState, useEffect } from "react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ArrowRight, Loader2 } from "lucide-react";
import { MpesaCheckoutModal } from "@/components/marketing/mpesa-checkout-modal";
import { PAID_PLANS, isPaidPlan, type PaidPlanId } from "../../../shared/plan-config";

interface AuthPageProps {
  initialMode?: "login" | "register";
  defaultPlan?: string;
  onSuccess?: () => void;
  onNavigateHome?: () => void;
}

export function AuthPage({ initialMode = "login", defaultPlan = "starter", onSuccess, onNavigateHome }: AuthPageProps) {
  const { login, needsSetup } = useApp();
  const [isRegister, setIsRegister] = useState(initialMode === "register" || needsSetup);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanId>(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("plan");
    if (p && isPaidPlan(p)) return p;
    return isPaidPlan(defaultPlan) ? defaultPlan : "starter";
  });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("plan");
    if (p && isPaidPlan(p)) {
      setSelectedPlan(p);
      setIsRegister(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      onSuccess?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            onClick={onNavigateHome}
            className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-on-brand">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="text-left">
              <span className="block text-xl font-semibold tracking-tight text-foreground">KodiTrack</span>
              <span className="text-xs text-muted-foreground">Property management</span>
            </div>
          </button>
          <p className="mt-3 text-sm text-muted-foreground">
            Rental records, clear balances, and maintenance tracking
          </p>
        </div>

        {/* Sign-in and paid account creation */}
        <Card className="border-border bg-card p-6 shadow-raised sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {isRegister ? "Choose a paid plan" : "Sign In to KodiTrack"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {isRegister
                ? needsSetup
                  ? "Choose a plan to create the first account for this workspace."
                  : "Choose the property and unit capacity that fits your portfolio. Payment creates your account."
                : "Enter your credentials to access your properties, rent ledger, and tenants."}
            </p>
          </div>

          {isRegister && (
            <>
              <div className="mb-4 space-y-2">
                {Object.values(PAID_PLANS).map((plan) => {
                  const active = selectedPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`flex w-full items-center justify-between gap-4 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active
                          ? "border-brand bg-brand-tint ring-1 ring-brand"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{plan.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{plan.properties} properties · {plan.units} units</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold text-foreground">KSh {plan.priceKes.toLocaleString("en-KE")}</span>
                        <span className="block text-[10px] text-muted-foreground">per month</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Monthly payment is initiated manually. KodiTrack does not automatically charge or renew your M-Pesa account.
              </p>
            </>
          )}

          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive-tint p-3 text-sm font-medium text-destructive" role="alert">
              {error}
            </div>
          )}

          {isRegister ? (
            <Button type="button" className="w-full" onClick={() => setCheckoutOpen(true)}>
              Continue to M-Pesa checkout <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="landlord@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button type="submit" disabled={submitting} className="mt-2 w-full">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign In <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}

          {!needsSetup && (
            <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
              {isRegister ? (
                <span>
                  Already have a landlord account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(false);
                      setError(null);
                    }}
                    className="font-medium text-brand-text underline underline-offset-4 hover:text-brand"
                  >
                    Sign in here
                  </button>
                </span>
              ) : (
                <span>
                  New landlord or manager?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(true);
                      setError(null);
                    }}
                    className="font-medium text-brand-text underline underline-offset-4 hover:text-brand"
                  >
                    Create a paid account
                  </button>
                </span>
              )}
            </div>
          )}
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          <button
            type="button"
            onClick={onNavigateHome}
            className="rounded-sm px-2 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back to KodiTrack
          </button>
        </div>
      </div>
      <MpesaCheckoutModal
        isOpen={checkoutOpen}
        planId={selectedPlan}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={() => {
          onSuccess?.();
          window.location.assign("/dashboard");
        }}
      />
    </div>
  );
}
