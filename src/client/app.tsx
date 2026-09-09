import { useEffect } from "react";
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

/**
 * The navigation, defined once.
 *
 * Opened directly, <AppNav> paints this as the app's own rail; inside the
 * Clawnify dashboard it paints nothing and hands the same list to the host, so
 * the user sees one nav rather than two. Every record type owns a colour and
 * keeps it on its tile wherever the type appears.
 *
 * Icons come from the platform's TILE_ICONS library — a name outside it draws
 * as a plain dot in the dashboard.
 */
const PORTFOLIO: AppNavItem[] = [
  // Not drawn as a row: the app's name opens it (the brand row standalone, the
  // app's own header in the dashboard).
  { id: "dashboard", label: "Dashboard", href: "/dashboard", home: true },
  { id: "properties", label: "Properties", href: "/properties", icon: "building-2", color: "green" },
  { id: "tenants", label: "Tenants", href: "/tenants", icon: "users", color: "blue" },
  { id: "leases", label: "Leases", href: "/leases", icon: "clipboard-list", color: "violet" },
];
const OPERATIONS: AppNavItem[] = [
  { id: "rent", label: "Rent", href: "/rent", icon: "dollar-sign", color: "amber" },
  { id: "maintenance", label: "Maintenance", href: "/maintenance", icon: "list-checks", color: "orange" },
];
const ADMIN: AppNavItem[] = [
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

  // Lets the dashboard restore this exact screen on reload.
  useEffect(() => {
    reportLocation(path);
  }, [path]);

  const groups = [
    { items: PORTFOLIO },
    { label: "Operations", items: OPERATIONS },
    { label: "Admin", items: ADMIN },
  ];

  return (
    <AppContext.Provider value={state}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground md:flex-row">
        {/* flex, so the SDK's <aside> stretches to the row height as a direct
            child would. Below md the SDK lays it out as a scrolling strip, which
            the flex-col above puts ABOVE the content rather than beside it. */}
        <div className="flex shrink-0">
          <AppNav
            title="OpenProperty"
            icon="home"
            groups={groups}
            active={activeFor(route)}
            onNavigate={(item) => navigate(item.href ?? "/dashboard")}
          />
        </div>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {state.loading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Loading…
            </div>
          ) : (
            <>
              {route.name === "dashboard" && <DashboardPage navigate={navigate} />}
              {route.name === "properties" && <PropertiesList navigate={navigate} />}
              {route.name === "property" && <PropertyPage id={route.id} navigate={navigate} />}
              {route.name === "tenants" && <TenantsList navigate={navigate} />}
              {route.name === "tenant" && <TenantPage id={route.id} navigate={navigate} />}
              {route.name === "leases" && <LeasesPage navigate={navigate} />}
              {route.name === "rent" && <RentPage />}
              {route.name === "maintenance" && <MaintenancePage />}
              {route.name === "settings" && <SettingsPage />}
              {route.name === "not-found" && (
                <Placeholder title="Not found" message="That page doesn't exist." />
              )}
            </>
          )}
        </main>
        <ErrorBanner />
      </div>
    </AppContext.Provider>
  );
}

function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-12 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
