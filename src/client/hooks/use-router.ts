import { useState, useEffect, useCallback } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "properties" }
  | { name: "property"; id: number }
  | { name: "tenants" }
  | { name: "tenant"; id: number }
  | { name: "leases" }
  | { name: "rent" }
  | { name: "rent-bank" }
  | { name: "rent-reminders" }
  | { name: "maintenance" }
  | { name: "settings" }
  | { name: "not-found" };

function parse(full: string): Route {
  const path = full.split("?")[0]; // a query (/settings?tab=reminders) picks a tab, not a page
  if (path === "/" || path === "/dashboard") return { name: "dashboard" };
  if (path === "/properties") return { name: "properties" };
  let m = path.match(/^\/properties\/(\d+)$/);
  if (m) return { name: "property", id: parseInt(m[1], 10) };
  if (path === "/tenants") return { name: "tenants" };
  m = path.match(/^\/tenants\/(\d+)$/);
  if (m) return { name: "tenant", id: parseInt(m[1], 10) };
  if (path === "/leases") return { name: "leases" };
  if (path === "/rent") return { name: "rent" };
  if (path === "/rent/bank") return { name: "rent-bank" };
  if (path === "/rent/reminders") return { name: "rent-reminders" };
  if (path === "/maintenance") return { name: "maintenance" };
  if (path === "/settings") return { name: "settings" };
  return { name: "not-found" };
}

export function useRouter() {
  const [path, setPath] = useState<string>(() => window.location.pathname);

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState(null, "", to);
    setPath(to);
  }, []);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { path, route: parse(path), navigate };
}
