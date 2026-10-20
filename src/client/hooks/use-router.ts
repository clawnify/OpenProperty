import { useState, useEffect, useCallback } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "properties" }
  | { name: "property"; id: number }
  | { name: "tenants" }
  | { name: "tenant"; id: number }
  | { name: "leases" }
  | { name: "rent" }
  | { name: "reports" }
  | { name: "maintenance" }
  | { name: "subscriptions" }
  | { name: "settings" }
  | { name: "landing" }
  | { name: "pricing" }
  | { name: "contact" }
  | { name: "login" }
  | { name: "register" }
  | { name: "not-found" };

function parse(path: string): Route {
  if (path === "/") return { name: "landing" };
  if (path === "/dashboard") return { name: "dashboard" };
  if (path === "/landing" || path === "/home") return { name: "landing" };
  if (path === "/pricing") return { name: "pricing" };
  if (path === "/contact") return { name: "contact" };
  if (path === "/properties") return { name: "properties" };
  let m = path.match(/^\/properties\/(\d+)$/);
  if (m) return { name: "property", id: parseInt(m[1], 10) };
  if (path === "/tenants") return { name: "tenants" };
  m = path.match(/^\/tenants\/(\d+)$/);
  if (m) return { name: "tenant", id: parseInt(m[1], 10) };
  if (path === "/leases") return { name: "leases" };
  if (path === "/rent") return { name: "rent" };
  if (path === "/reports") return { name: "reports" };
  if (path === "/maintenance") return { name: "maintenance" };
  if (path === "/subscriptions") return { name: "subscriptions" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/login") return { name: "login" };
  if (path === "/register") return { name: "register" };
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
