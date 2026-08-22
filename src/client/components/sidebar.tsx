import {
  Building2,
  Users,
  ClipboardList,
  Wrench,
  Settings,
  LayoutDashboard,
  Receipt,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Route } from "@/hooks/use-router";

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  match: (r: Route) => boolean;
}

const sections: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Portfolio",
    items: [
      { label: "Dashboard",   icon: LayoutDashboard, path: "/dashboard",  match: (r) => r.name === "dashboard" },
      { label: "Properties",  icon: Building2,       path: "/properties", match: (r) => r.name === "properties" || r.name === "property" },
      { label: "Tenants",     icon: Users,           path: "/tenants",    match: (r) => r.name === "tenants" || r.name === "tenant" },
      { label: "Leases",      icon: ClipboardList,   path: "/leases",     match: (r) => r.name === "leases" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Rent",         icon: Receipt, path: "/rent",        match: (r) => r.name === "rent" },
      { label: "Maintenance",  icon: Wrench,  path: "/maintenance", match: (r) => r.name === "maintenance" },
    ],
  },
  {
    heading: "Admin",
    items: [
      { label: "Settings", icon: Settings, path: "/settings", match: (r) => r.name === "settings" },
    ],
  },
];

export function Sidebar({
  route,
  navigate,
}: {
  route: Route;
  navigate: (to: string) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Home className="h-4 w-4" />
        </div>
        <span className="text-base font-semibold tracking-tight">OpenProperty</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.heading} className="mb-4">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.heading}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.match(route);
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        !active && "hover:bg-sidebar-accent/60",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
