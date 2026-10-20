import { useState, useEffect } from "react";
import { AppNav, reportLocation, type AppNavItem } from "@clawnify/app/client";
import { useAppState } from "./hooks/use-app-state";
import { useRouter, type Route } from "./hooks/use-router";
import { AppContext } from "./context";
import { ErrorBanner } from "./components/error-banner";
import { DashboardPage } from "./components/dashboard/dashboard-page";
import { PropertiesList } from "./components/properties/properties-list";
import { PropertyPage } from "./components/properties/property-page";
import { TenantsList } from "./components/tenants/tenants-list";
import { TenantPage } from "./components/tenants/tenant-page";
import { LeasesPage } from "./components/leases/leases-page";
import { RentPage } from "./components/rent/rent-page";
import { MaintenancePage } from "./components/maintenance/maintenance-page";
import { SettingsPage } from "./components/settings/settings-page";
import { AuthPage } from "./components/auth/auth-page";
import { ReportsPage } from "./components/reports/reports-page";
import { LandingPage } from "./components/marketing/landing-page";
import { ContactPage } from "./components/contact/contact-page";
import { SubscriptionsPage } from "./components/subscriptions/subscriptions-page";
import { NotFoundPage } from "./components/not-found-page";
import { DashboardSkeleton } from "./components/skeletons/DashboardSkeleton";
import { DevPlanSwitcher } from "./components/developer/dev-plan-switcher";
import { getPlanLimits, isPaidPlan, PAID_PLANS } from "../shared/plan-config";
import {
  Menu,
  X,
  Building2,
  Users,
  ClipboardList,
  DollarSign,
  Receipt,
  ListChecks,
  Settings,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  CreditCard,
} from "lucide-react";

/**
 * Navigation items for desktop AppNav rail.
 */
const PORTFOLIO: AppNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", home: true },
  { id: "properties", label: "Properties", href: "/properties", icon: "building-2", color: "green" },
  { id: "tenants", label: "Tenants", href: "/tenants", icon: "users", color: "blue" },
  { id: "leases", label: "Leases", href: "/leases", icon: "clipboard-list", color: "violet" },
];
const OPERATIONS: AppNavItem[] = [
  { id: "rent", label: "Rent", href: "/rent", icon: "dollar-sign", color: "amber" },
  { id: "reports", label: "Reports", href: "/reports", icon: "receipt", color: "green" },
  { id: "maintenance", label: "Maintenance", href: "/maintenance", icon: "list-checks", color: "orange" },
];
const ADMIN: AppNavItem[] = [
  { id: "subscriptions", label: "Subscription", href: "/subscriptions", icon: "credit-card" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
];

/** A record page keeps its collection's row lit. */
function activeFor(route: Route): string {
  if (route.name === "property") return "properties";
  if (route.name === "tenant") return "tenants";
  return route.name;
}

export function App() {
  const state = useAppState();
  const { path, route, navigate } = useRouter();
  const [mobileShelfOpen, setMobileShelfOpen] = useState(false);

  // Lets the host dashboard restore this exact screen on reload.
  useEffect(() => {
    reportLocation(path);
  }, [path]);

  // If user logs out or is unauthenticated, redirect private routes to "/"
  useEffect(() => {
    if (!state.authLoading && !state.user) {
      const publicPaths = ["/", "/landing", "/home", "/pricing", "/contact", "/login", "/register"];
      const isPrivate = !publicPaths.includes(path) && route.name !== "not-found";
      if (isPrivate) {
        navigate("/");
      }
    }
  }, [state.authLoading, state.user, path, route.name, navigate]);

  // If authenticated user visits root "/", redirect to dashboard
  useEffect(() => {
    if (state.user && path === "/") {
      navigate("/dashboard");
    }
  }, [state.user, path, navigate]);

  const groups = [
    { items: PORTFOLIO },
    { label: "Operations", items: OPERATIONS },
    { label: "Admin", items: ADMIN },
  ];

  // If checking authentication, show skeleton
  if (state.authLoading) {
    return <DashboardSkeleton />;
  }

  // If user is not authenticated
  if (!state.user) {
    if (route.name === "login") {
      return (
        <AppContext.Provider value={state}>
          <AuthPage
            initialMode="login"
            onSuccess={() => navigate("/dashboard")}
            onNavigateHome={() => navigate("/")}
          />
          <ErrorBanner />
        </AppContext.Provider>
      );
    }

    if (route.name === "register" || state.needsSetup) {
      return (
        <AppContext.Provider value={state}>
          <AuthPage
            initialMode="register"
            onSuccess={() => navigate("/dashboard")}
            onNavigateHome={() => navigate("/")}
          />
          <ErrorBanner />
        </AppContext.Provider>
      );
    }

    if (route.name === "contact") {
      return (
        <AppContext.Provider value={state}>
          <ContactPage navigate={navigate} />
          <ErrorBanner />
        </AppContext.Provider>
      );
    }

    if (route.name === "not-found") {
      return (
        <AppContext.Provider value={state}>
          <NotFoundPage navigate={navigate} />
          <ErrorBanner />
        </AppContext.Provider>
      );
    }

    // Default unauthenticated view: Marketing Landing Page
    return (
      <AppContext.Provider value={state}>
        <LandingPage
          onGetStarted={() => navigate("/register")}
          onSignIn={() => navigate("/login")}
          onSelectPlan={(plan) => navigate(`/register?plan=${plan}`)}
          onNavigateContact={() => navigate("/contact")}
        />
        <ErrorBanner />
      </AppContext.Provider>
    );
  }

  const userPlan = state.user.plan || "free";
  const limits = getPlanLimits(userPlan);
  const unitLimit = limits.units;
  const propertyLimit = limits.properties;
  const planLabel = isPaidPlan(userPlan) ? PAID_PLANS[userPlan].name : "Legacy";
  const currentUnits = state.properties.reduce((sum, p) => sum + (p.unit_count ?? 0), 0);

  return (
    <AppContext.Provider value={state}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground md:flex-row">
        {/* ── Mobile Sticky Top Bar with Shelf Drawer Button (md:hidden) ── */}
        <div className="flex md:hidden h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileShelfOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors shadow-sm"
              aria-label="Open Navigation Shelf"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white font-bold text-xs shadow-sm">
                <Building2 className="h-4 w-4" />
              </div>
              <span className="font-bold text-sm tracking-tight text-foreground">KodiTrack</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 px-2.5 py-0.5 text-[10px] font-semibold text-teal-800 dark:text-teal-300 capitalize">
              {planLabel} ({currentUnits}/{unitLimit} units)
            </span>
          </div>
        </div>

        {/* ── Mobile Slide-Over Shelf Drawer ── */}
        {mobileShelfOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileShelfOpen(false)}
            />

            {/* Slide-out Shelf Container */}
            <div className="relative flex w-72 max-w-[85vw] flex-1 flex-col bg-card border-r border-border shadow-2xl z-10 animate-in slide-in-from-left duration-200">
              {/* Shelf Header */}
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-foreground block">KodiTrack</span>
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold uppercase tracking-wider">
                      Property Management
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileShelfOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User Account / Plan Overview Card */}
              <div className="border-b border-border p-3.5 bg-muted/40">
                <div className="text-xs font-semibold text-foreground truncate">{state.user.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{state.user.email}</div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-medium text-muted-foreground">Plan Capacity:</span>
                  <span className="font-semibold text-teal-700 dark:text-teal-400 capitalize">
                    {planLabel} ({currentUnits}/{unitLimit} units)
                  </span>
                </div>
                {userPlan === "free" && currentUnits >= unitLimit && (
                  <div className="mt-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Legacy unit cap reached. Choose a paid plan to expand your portfolio.
                  </div>
                )}
                {propertyLimit !== null && state.properties.length >= propertyLimit && (
                  <div className="mt-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Property cap: {state.properties.length}/{propertyLimit}
                  </div>
                )}
              </div>

              {/* Shelf Navigation Links */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase px-2 mb-1">
                    Portfolio
                  </div>
                  <nav className="space-y-0.5">
                    {[
                      { name: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
                      { name: "properties", label: "Properties", href: "/properties", icon: Building2 },
                      { name: "tenants", label: "Tenants", href: "/tenants", icon: Users },
                      { name: "leases", label: "Leases", href: "/leases", icon: ClipboardList },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = activeFor(route) === item.name;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            setMobileShelfOpen(false);
                            navigate(item.href);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            active
                              ? "bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-semibold"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground"}`} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                <div>
                  <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase px-2 mb-1">
                    Operations
                  </div>
                  <nav className="space-y-0.5">
                    {[
                      { name: "rent", label: "Rent Collections", href: "/rent", icon: DollarSign },
                      { name: "reports", label: "Financial Reports", href: "/reports", icon: Receipt },
                      { name: "maintenance", label: "Maintenance", href: "/maintenance", icon: ListChecks },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = activeFor(route) === item.name;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            setMobileShelfOpen(false);
                            navigate(item.href);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            active
                              ? "bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-semibold"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground"}`} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                <div>
                  <div className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase px-2 mb-1">
                    Settings & Security
                  </div>
                  <nav className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileShelfOpen(false);
                        navigate("/subscriptions");
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        activeFor(route) === "subscriptions"
                          ? "bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-semibold"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span>Subscription & Plan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileShelfOpen(false);
                        navigate("/settings");
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        activeFor(route) === "settings"
                          ? "bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-semibold"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span>Settings & Profile</span>
                    </button>
                  </nav>
                </div>
              </div>

              {/* Shelf Footer Sign Out */}
              <div className="border-t border-border p-3">
                <button
                  type="button"
                  onClick={async () => {
                    setMobileShelfOpen(false);
                    await state.logout();
                    navigate("/");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/20 bg-destructive-tint px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Desktop Navigation Sidebar (hidden md:flex) ── */}
        <div className="relative z-20 hidden shrink-0 border-r border-border bg-sidebar shadow-[4px_0_14px_-10px_rgba(20,20,20,0.45)] md:flex">
          <AppNav
            title="KodiTrack"
            icon="home"
            groups={groups}
            active={activeFor(route)}
            onNavigate={(item) => navigate(item.href ?? "/dashboard")}
          />
        </div>

        {/* ── Main App Content Canvas ── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <DevPlanSwitcher />
          {state.loading ? (
            <DashboardSkeleton />
          ) : (
            <>
              {route.name === "dashboard" && <DashboardPage navigate={navigate} />}
              {route.name === "properties" && <PropertiesList navigate={navigate} />}
              {route.name === "property" && <PropertyPage id={route.id} navigate={navigate} />}
              {route.name === "tenants" && <TenantsList navigate={navigate} />}
              {route.name === "tenant" && <TenantPage id={route.id} navigate={navigate} />}
              {route.name === "leases" && <LeasesPage navigate={navigate} />}
              {route.name === "rent" && <RentPage />}
              {route.name === "reports" && <ReportsPage />}
              {route.name === "maintenance" && <MaintenancePage />}
              {route.name === "subscriptions" && <SubscriptionsPage navigate={navigate} />}
              {route.name === "settings" && <SettingsPage />}
              {(route.name === "landing" || route.name === "pricing") && (
                <LandingPage
                  onGetStarted={() => navigate("/dashboard")}
                  onSignIn={() => navigate("/dashboard")}
                  onSelectPlan={(plan) => navigate(`/register?plan=${plan}`)}
                  onNavigateContact={() => navigate("/contact")}
                />
              )}
              {route.name === "contact" && <ContactPage navigate={navigate} />}
              {route.name === "not-found" && <NotFoundPage navigate={navigate} />}
            </>
          )}
        </main>
        <ErrorBanner />
      </div>
    </AppContext.Provider>
  );
}
