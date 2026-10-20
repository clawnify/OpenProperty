import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Home,
  Receipt,
  Wrench,
  TrendingUp,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Smartphone,
  Plus,
  AlertTriangle,
  DollarSign,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, daysBetween, formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import type { DashboardSummary } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { DashboardSkeleton } from "../skeletons/DashboardSkeleton";
import { MpesaCheckoutModal } from "../marketing/mpesa-checkout-modal";
import { OnboardingModal } from "./onboarding-modal";
import { getPlanLimits, isPaidPlan, PAID_PLANS, type PaidPlanId } from "../../../shared/plan-config";

export function DashboardPage({ navigate }: { navigate: (to: string) => void }) {
  const { user, settings, setError, setUser } = useApp();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeChartBar, setActiveChartBar] = useState<number | null>(null);

  useEffect(() => {
    if (user && !localStorage.getItem(`koditrack_onboarded_${user.id}`)) {
      setOnboardingOpen(true);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const data = await api<DashboardSummary>("GET", "/api/dashboard/summary");
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) {
          const message = (err as Error).message;
          setLoadError(message);
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadAttempt, setError]);

  if (loading) {
    return <DashboardSkeleton />;
  }
  if (!summary) {
    return (
      <PageShell title="Dashboard">
        <div className="mx-auto max-w-xl rounded-lg border border-destructive/30 bg-destructive-tint/50 p-6" role="alert">
          <h2 className="font-semibold text-destructive">Dashboard data could not be loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">{loadError || "Please try again."}</p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      </PageShell>
    );
  }

  // Personalized dynamic greeting
  const hour = new Date().getHours();
  let timeGreeting = "Good day";
  let greetingIcon = "🌤️";
  if (hour >= 5 && hour < 12) {
    timeGreeting = "Good morning";
    greetingIcon = "☀️";
  } else if (hour >= 12 && hour < 17) {
    timeGreeting = "Good afternoon";
    greetingIcon = "🌤️";
  } else if (hour >= 17 && hour < 22) {
    timeGreeting = "Good evening";
    greetingIcon = "🌆";
  } else {
    timeGreeting = "Welcome back";
    greetingIcon = "🌙";
  }

  const firstName = user?.name ? user.name.split(" ")[0] : "Landlord";
  const userPlan = user?.plan || "free";
  const planLimits = getPlanLimits(userPlan);
  const planName = isPaidPlan(userPlan) ? PAID_PLANS[userPlan].name : "Legacy access";
  const nextPlan: PaidPlanId =
    userPlan === "starter" ? "plus" : userPlan === "plus" ? "manager" : userPlan === "manager" ? "manager" : "starter";

  // Calculate Collection Performance
  const totalChargedThisMonth = summary.month_settled + summary.month_outstanding;
  const settlementRate = totalChargedThisMonth > 0
    ? Math.round((summary.month_settled / totalChargedThisMonth) * 100)
    : null;

  // Real monthly trends from database (empty when user has not recorded payment cycles)
  const trends = summary.monthly_trends && summary.monthly_trends.length > 0
    ? summary.monthly_trends
    : [];

  const maxChartValue = trends.length > 0
    ? Math.max(...trends.map((t) => Math.max(t.charged, t.collected, 1000)))
    : 1000;

  const currentDay = new Date().getDate();
  const rentDueDay = settings.default_rent_due_day || 5;
  const isNearDueDay = currentDay >= rentDueDay - 3 && currentDay <= rentDueDay + 3;

  return (
    <PageShell
      title={`${timeGreeting}, ${firstName}! ${greetingIcon}`}
      meta={
        settlementRate !== null && settlementRate >= 95
          ? `Portfolio rent charges are ${settlementRate}% settled this month.`
          : summary.overdue_count > 0
          ? `${summary.overdue_count} overdue payment${summary.overdue_count === 1 ? "" : "s"} requiring attention.`
          : settlementRate === null
          ? "Record rent charges to see this month's collection performance."
          : `Rental operations command center · ${new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
      }
      actions={
        <button
          type="button"
          onClick={() => setOnboardingOpen(true)}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 border border-border bg-card px-2.5 py-1.5 rounded-lg shadow-xs"
        >
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>Edit Greeting</span>
        </button>
      }
    >
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{planName} plan</p>
          <p className="text-xs text-muted-foreground">
            {planLimits.properties === null
              ? `Existing access: up to ${planLimits.units} units. New accounts choose a paid plan.`
              : `Up to ${planLimits.properties} properties and ${planLimits.units} rental units. Monthly renewal is manual.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUpgradeModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
        >
          <Smartphone className="h-3.5 w-3.5" />
          {userPlan === "manager" ? "Renew Portfolio" : "Change or renew plan"}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* ── INTELLIGENT REAL-TIME NOTIFICATION BANNER ── */}
      {summary.overdue_count > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive-tint/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive text-white font-bold shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="font-bold text-destructive block">Action Required: {summary.overdue_count} Overdue Tenant Payment{summary.overdue_count === 1 ? "" : "s"}</span>
              <span className="text-muted-foreground text-[11px] truncate block">
                Total unpaid balance of {formatMoney(summary.overdue_total, settings.currency)} requires follow-up to protect monthly cash flow.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/rent")}
            className="shrink-0 rounded-lg bg-destructive text-white px-3 py-1.5 font-semibold text-xs hover:bg-destructive/90 self-start sm:self-auto"
          >
            Review Arrears
          </button>
        </div>
      ) : summary.units === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold shrink-0">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="font-bold text-emerald-950 dark:text-emerald-200 block">Welcome to your Portfolio Command Center!</span>
              <span className="text-stone-600 dark:text-stone-400 text-[11px] block">
                Get started by creating your first rental property and unit to begin tracking occupancy and rent.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/properties")}
            className="shrink-0 rounded-lg bg-[#155e4f] text-white px-3 py-1.5 font-semibold text-xs hover:bg-[#0f4a3e] self-start sm:self-auto"
          >
            + Add Property
          </button>
        </div>
      ) : isNearDueDay && summary.month_outstanding > 0 ? (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 dark:bg-amber-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white font-bold shrink-0">
              <Calendar className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="font-bold text-amber-950 dark:text-amber-200 block">
                Rent Collection Cycle Notice (Due {rentDueDay}th)
              </span>
              <span className="text-amber-800 dark:text-amber-300 text-[11px] block">
                {formatMoney(summary.month_outstanding, settings.currency)} currently outstanding across occupied units for this billing period.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/rent")}
            className="shrink-0 rounded-lg bg-amber-600 text-white px-3 py-1.5 font-semibold text-xs hover:bg-amber-700 self-start sm:self-auto"
          >
            Record Payments
          </button>
        </div>
      ) : summary.urgent_work_orders > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning-tint/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning text-white font-bold shrink-0">
              <Wrench className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="font-bold text-warning block">Urgent Maintenance Request</span>
              <span className="text-muted-foreground text-[11px] block">
                A priority repair ticket has been logged and is awaiting dispatch.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/maintenance")}
            className="shrink-0 rounded-lg bg-warning text-white px-3 py-1.5 font-semibold text-xs hover:bg-warning/90 self-start sm:self-auto"
          >
            View Ticket
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>All rental operations running smoothly. Zero pending overdue payments for this cycle.</span>
          </div>
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium underline hover:text-emerald-950 shrink-0"
          >
            Personalize Greeting
          </button>
        </div>
      )}

      {/* ── QUICK ACTION DOCK ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate("/rent")}
          className="group flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs hover:border-emerald-600/40 hover:bg-emerald-50/30 transition-all text-left"
        >
          <div>
            <div className="text-xs font-bold text-foreground group-hover:text-emerald-800 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
              <span>Record Rent</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Log M-Pesa or cash</div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>

        <button
          type="button"
          onClick={() => navigate("/properties")}
          className="group flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs hover:border-teal-600/40 hover:bg-teal-50/30 transition-all text-left"
        >
          <div>
            <div className="text-xs font-bold text-foreground group-hover:text-teal-800 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-teal-600" />
              <span>Add Unit / House</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Expand portfolio</div>
          </div>
          <Plus className="h-4 w-4 text-muted-foreground group-hover:text-teal-700" />
        </button>

        <button
          type="button"
          onClick={() => navigate("/tenants")}
          className="group flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs hover:border-blue-600/40 hover:bg-blue-50/30 transition-all text-left"
        >
          <div>
            <div className="text-xs font-bold text-foreground group-hover:text-blue-800 flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
              <span>New Tenant / Lease</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Onboard tenant</div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>

        <button
          type="button"
          onClick={() => navigate("/reports")}
          className="group flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs hover:border-purple-600/40 hover:bg-purple-50/30 transition-all text-left"
        >
          <div>
            <div className="text-xs font-bold text-foreground group-hover:text-purple-800 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-purple-600" />
              <span>Rent Roll Report</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Export CSV / Excel</div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-purple-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>

      {/* ── CORE KPIS ── */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Occupancy Rate"
          value={`${summary.occupancy_rate}%`}
          sub={`${summary.occupied} of ${summary.units} units occupied`}
          icon={<Home className="h-4 w-4 text-emerald-600" />}
          badge={summary.units === 0 ? "No units yet" : summary.vacant > 0 ? `${summary.vacant} vacant` : "Fully occupied"}
          badgeTone={summary.units === 0 ? "default" : summary.vacant > 0 ? "warn" : "positive"}
        />
        <KpiCard
          label="Cash Received (This Month)"
          value={formatMoney(summary.month_collected, settings.currency)}
          sub={settlementRate === null ? "No rent charges recorded this month" : `${settlementRate}% of charges settled`}
          icon={<Receipt className="h-4 w-4 text-emerald-600" />}
          tone="positive"
        />
        <KpiCard
          label="Outstanding Rent"
          value={formatMoney(summary.month_outstanding, settings.currency)}
          sub={summary.overdue_count ? `${summary.overdue_count} overdue payment${summary.overdue_count === 1 ? "" : "s"}` : "No overdue rent"}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={summary.overdue_total > 0 ? "danger" : summary.month_outstanding > 0 ? "warn" : "default"}
        />
        <KpiCard
          label="Active Leases"
          value={String(summary.active_leases)}
          sub={summary.upcoming_move_outs ? `${summary.upcoming_move_outs} ending in 30 days` : summary.active_leases ? "No expirations in 30 days" : "No active leases yet"}
          icon={<ClipboardList className="h-4 w-4 text-teal-600" />}
          tone={summary.upcoming_move_outs > 0 ? "warn" : "default"}
        />
      </section>

      {/* ── REVENUE TRENDS & CASHFLOW GRAPH + ACTIONABLE INSIGHTS ── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Interactive 6-Month Collections Chart */}
        <Card className="p-5 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span>Revenue & Collection Velocity (Past 6 Months)</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comparison between rent charged and payments recorded.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  <span>Cash applied</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700" />
                  <span>Charged Target</span>
                </span>
              </div>
            </div>

            {/* SVG/CSS Dual Bar Graph */}
            {trends.length === 0 ? (
              <div className="h-52 w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-xl bg-muted/20">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-2">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-foreground">No Collection History Yet</p>
                <p className="text-[11px] text-muted-foreground max-w-xs mt-1 leading-relaxed">
                  Your 6-month revenue trends and collection velocity will automatically visualize here once rent payments are recorded.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(summary.units === 0 ? "/properties" : "/rent")}
                  className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  {summary.units === 0 ? "+ Add your first property or unit →" : "Record your first rent payment →"}
                </button>
              </div>
            ) : (
              <div className="h-52 w-full pt-4 flex items-end justify-between gap-2 sm:gap-4 px-2">
                {trends.map((item, idx) => {
                  const chargedPct = Math.min(100, Math.round((item.charged / maxChartValue) * 100));
                  const collectedPct = Math.min(100, Math.round((item.collected / maxChartValue) * 100));
                  const isHovered = activeChartBar === idx;

                  const monthName = new Date(`${item.period}-15`).toLocaleDateString(undefined, { month: "short" });

                  return (
                    <div
                      key={item.period}
                      className="relative flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                      onMouseEnter={() => setActiveChartBar(idx)}
                      onMouseLeave={() => setActiveChartBar(null)}
                    >
                      {/* Tooltip on hover */}
                      {isHovered && (
                        <div className="absolute -top-12 z-20 rounded-lg bg-stone-900 text-white text-[11px] py-1 px-2 shadow-lg whitespace-nowrap animate-in fade-in zoom-in-95">
                          <div className="font-bold">{item.period}</div>
                          <div>Cash applied: {formatMoney(item.collected, settings.currency)}</div>
                          <div className="text-stone-400">Charged: {formatMoney(item.charged, settings.currency)}</div>
                        </div>
                      )}

                      {/* Bars Container */}
                      <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-40">
                        {/* Charged bar */}
                        <div
                          style={{ height: `${Math.max(8, chargedPct)}%` }}
                          className="w-1/2 max-w-[18px] rounded-t-md bg-stone-200 dark:bg-stone-700 transition-all duration-300"
                        />
                        {/* Cash applied bar */}
                        <div
                          style={{ height: `${Math.max(8, collectedPct)}%` }}
                          className={`w-1/2 max-w-[18px] rounded-t-md transition-all duration-300 ${
                            isHovered ? "bg-emerald-500" : "bg-emerald-600"
                          }`}
                        />
                      </div>

                      {/* Month Label */}
                      <div className="text-[11px] font-medium text-muted-foreground mt-2">
                        {monthName}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Rent settlement rate:{" "}
              <strong className="font-semibold text-emerald-700">
                {settlementRate === null ? "Not available" : `${settlementRate}%`}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => navigate("/rent")}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span>View full rent breakdown</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </Card>

        {/* Actionable Insights Card */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>Actionable Insights</span>
              </h3>
              <Badge variant="outline" className="text-[10px] font-bold">
                Smart Suggestions
              </Badge>
            </div>

            <div className="space-y-3">
              {summary.overdue_count > 0 ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive-tint p-3 text-xs">
                  <div className="font-semibold text-destructive flex items-center gap-1.5">
                    <CircleAlert className="h-4 w-4 shrink-0" />
                    <span>{summary.overdue_count} Overdue Tenant{summary.overdue_count === 1 ? "" : "s"}</span>
                  </div>
                  <p className="text-muted-foreground mt-1">
                    KSh {summary.overdue_total.toLocaleString()} is currently pending beyond due date.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/rent")}
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-destructive hover:underline"
                  >
                    Send STK prompt / Reconcile →
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Zero Arrears!</div>
                    <div className="text-stone-600 mt-0.5">All tenants have cleared their scheduled rent obligations for this cycle.</div>
                  </div>
                </div>
              )}

              {summary.vacant > 0 && (
                <div className="rounded-xl border border-warning/20 bg-warning-tint p-3 text-xs">
                  <div className="font-semibold text-warning flex items-center gap-1.5">
                    <Home className="h-4 w-4 shrink-0" />
                    <span>{summary.vacant} Vacant Unit{summary.vacant === 1 ? "" : "s"}</span>
                  </div>
                  <p className="text-muted-foreground mt-1">
                    Assign incoming tenants or advertise vacant units to maintain 100% occupancy.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/tenants")}
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-warning hover:underline"
                  >
                    Assign Tenant to Unit →
                  </button>
                </div>
              )}

              {summary.urgent_work_orders > 0 && (
                <div className="rounded-xl border border-destructive/20 bg-destructive-tint p-3 text-xs">
                  <div className="font-semibold text-destructive flex items-center gap-1.5">
                    <Wrench className="h-4 w-4 shrink-0" />
                    <span>{summary.urgent_work_orders} Urgent Maintenance Request</span>
                  </div>
                  <p className="text-muted-foreground mt-1">
                    {summary.urgent_work_orders} open urgent maintenance request{summary.urgent_work_orders === 1 ? "" : "s"} need attention.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/maintenance")}
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-destructive hover:underline"
                  >
                    View Ticket Details →
                  </button>
                </div>
              )}

              {summary.upcoming_move_outs > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>{summary.upcoming_move_outs} Lease Expiring Within 30 Days</span>
                  </div>
                  <p className="text-blue-700 mt-1">
                    Reach out for lease renewals or prepare turnover inspections.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/leases")}
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-800 hover:underline"
                  >
                    Review Leases →
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Data Privacy: Private & Isolated Landlord Account</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
        </Card>
      </section>

      {/* ── PORTFOLIO DETAILS & RECENT ACTIVITY ── */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Open Work Orders */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Maintenance Work Orders</h2>
              <p className="text-xs text-muted-foreground">Open repair and vendor service tickets.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/maintenance")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all ({summary.open_work_orders})
            </button>
          </div>
          {summary.recent_work_orders.length === 0 ? (
            <Empty
              icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />}
              title="All caught up!"
              message="No active maintenance tickets across your properties."
            />
          ) : (
            <ul className="divide-y divide-border">
              {summary.recent_work_orders.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{w.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[w.property_name, w.unit_name].filter(Boolean).join(" · ") || "Unassigned"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={w.priority} />
                    <StatusBadge status={w.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Lease Expirations */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Upcoming Lease Expirations</h2>
              <p className="text-xs text-muted-foreground">Tenants reaching end of lease term (next 60 days).</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/leases")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all ({summary.active_leases} active)
            </button>
          </div>
          {summary.upcoming_expirations.length === 0 ? (
            <Empty
              icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />}
              title="No upcoming lease expirations"
              message="All active leases are securely locked in for the next 60 days."
            />
          ) : (
            <ul className="divide-y divide-border">
              {summary.upcoming_expirations.map((l) => {
                const today = toIsoDate(new Date());
                const days = daysBetween(today, l.end_date);
                return (
                  <li key={l.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.tenant_first_name || "—"} {l.tenant_last_name || ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[l.property_name, l.unit_name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium text-foreground">{formatDate(l.end_date)}</div>
                      <div className={cn(
                        "text-muted-foreground",
                        days <= 14 && "text-destructive font-bold",
                      )}>
                        {days < 0 ? "Already ended" : days === 0 ? "Expires today" : `in ${days} day${days === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* Upgrade Modal for In-Dashboard Upgrades */}
      {upgradeModalOpen && (
        <MpesaCheckoutModal
          isOpen={upgradeModalOpen}
          planId={nextPlan}
          currentUser={user}
          onClose={() => setUpgradeModalOpen(false)}
          onSuccess={(updatedUser) => {
            setUpgradeModalOpen(false);
            if (updatedUser) setUser(updatedUser);
          }}
        />
      )}

      {/* First-Time User Guidance & Greeting Personalization Modal */}
      {onboardingOpen && (
        <OnboardingModal
          isOpen={onboardingOpen}
          user={user}
          onClose={() => setOnboardingOpen(false)}
          onComplete={(updatedUser) => {
            setUser(updatedUser);
          }}
        />
      )}
    </PageShell>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  badge,
  badgeTone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "default" | "positive" | "warn" | "danger";
  badge?: string;
  badgeTone?: "default" | "positive" | "warn";
}) {
  return (
    <Card className={cn(
      "relative p-4 transition-shadow hover:shadow-sm",
      tone === "warn" && "bg-warning-tint/50 border-warning/30",
      tone === "danger" && "bg-destructive-tint/50 border-destructive/30",
      tone === "positive" && "bg-emerald-50/40 border-emerald-200/60"
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground tracking-tight">{label}</span>
        <span className="opacity-70">{icon}</span>
      </div>

      <div className={cn(
        "text-2xl font-extrabold tracking-tight mt-2",
        tone === "positive" && "text-emerald-700 dark:text-emerald-400",
        tone === "warn" && "text-amber-600 dark:text-amber-400",
        tone === "danger" && "text-destructive",
      )}>
        {value}
      </div>

      <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40 text-xs">
        <span className="truncate text-muted-foreground text-[11px]">{sub}</span>
        {badge && (
          <span className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0",
            badgeTone === "positive" && "bg-emerald-100 text-emerald-800",
            badgeTone === "warn" && "bg-amber-100 text-amber-800",
            badgeTone === "default" && "bg-muted text-muted-foreground",
          )}>
            {badge}
          </span>
        )}
      </div>
    </Card>
  );
}

function Empty({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: "bg-destructive-tint text-destructive border-destructive/20 font-bold",
    high: "bg-warning-tint text-warning border-warning/20 font-semibold",
    normal: "bg-info-tint text-info border-info/20",
    low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
      map[priority] ?? map.normal,
    )}>
      {priority === "urgent" && <CircleAlert className="h-3 w-3" />}
      <span className="capitalize">{priority}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "secondary",
    assigned: "default",
    in_progress: "default",
    completed: "outline",
    cancelled: "outline",
  };
  return <Badge variant={(map[status] ?? "secondary") as never} className="capitalize text-[10px]">{status.replace("_", " ")}</Badge>;
}
