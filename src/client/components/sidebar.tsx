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
    <aside className="hidden w-[17.1875rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      {/* The brand row and the page toolbar are both 56px, so their bottoms
          form one continuous line across the shell. */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="app-icon size-7">
          <Home className="size-4" />
        </div>
        <span className="text-[0.9375rem] font-semibold tracking-tight">OpenProperty</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.heading} className="mb-4">
            {/* Sentence case, not small caps: the 11px tracked style is only
                ever the label above a KPI number. */}
            <div className="section-label px-2 pb-1">{section.heading}</div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.match(route);
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={cn(
                        // 28px, 9px radius, 14px/500 — and the active row is a
                        // NEUTRAL ink wash, never the brand hue: colour in the
                        // rail is reserved for counts.
                        "flex h-7 w-full items-center gap-1.5 rounded-[0.5625rem] py-0 pl-2 pr-4 text-sm font-medium transition-colors duration-150",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        !active && "hover:bg-sidebar-accent",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
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
