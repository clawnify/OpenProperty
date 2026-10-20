import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type {
  User,
  Property,
  Unit,
  Tenant,
  Lease,
  RentCharge,
  Vendor,
  WorkOrder,
  NewProperty,
  NewUnit,
  NewTenant,
  NewLease,
  NewWorkOrder,
  NewVendor,
} from "../types";

export interface AppSettings {
  default_rent_due_day: number;
  late_fee_amount: number;
  late_fee_grace_days: number;
  currency: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  default_rent_due_day: 1,
  late_fee_amount: 500,
  late_fee_grace_days: 5,
  currency: "KES",
};

function parseSettings(raw: Record<string, string>): AppSettings {
  const num = (key: keyof AppSettings, fallback: number) => {
    const v = parseFloat(raw[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    default_rent_due_day: num("default_rent_due_day", DEFAULT_SETTINGS.default_rent_due_day),
    late_fee_amount: num("late_fee_amount", DEFAULT_SETTINGS.late_fee_amount),
    late_fee_grace_days: num("late_fee_grace_days", DEFAULT_SETTINGS.late_fee_grace_days),
    currency: raw.currency || DEFAULT_SETTINGS.currency,
  };
}

export function useAppState() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lookup loaders ─────────────────────────────────────────────────

  const refreshLookups = useCallback(async () => {
    try {
      const [props, vens, st] = await Promise.all([
        api<{ properties: Property[] }>("GET", "/api/properties"),
        api<{ vendors: Vendor[] }>("GET", "/api/vendors").catch(() => ({ vendors: [] })),
        api<{ settings: Record<string, string> }>("GET", "/api/settings").catch(() => ({ settings: {} })),
      ]);
      setProperties(props.properties);
      setVendors(vens.vendors);
      setSettings(parseSettings(st.settings));
    } catch {
      // Ignore if unauthorized
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      setAuthLoading(true);
      const res = await api<{ user: User | null; needs_setup: boolean }>("GET", "/api/auth/me");
      setUser(res.user);
      setNeedsSetup(res.needs_setup);
      if (res.user || res.needs_setup) {
        await refreshLookups();
      }
      return res.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setAuthLoading(false);
      setLoading(false);
    }
  }, [refreshLookups]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: User; token: string }>("POST", "/api/auth/login", { email, password });
    setUser(res.user);
    await refreshLookups();
    return res.user;
  }, [refreshLookups]);

  const register = useCallback(async (data: { email: string; password: string; name: string; phone?: string | null; plan?: string }) => {
    const res = await api<{ user: User; token: string }>("POST", "/api/auth/register", data);
    setUser(res.user);
    setNeedsSetup(false);
    await refreshLookups();
    return res.user;
  }, [refreshLookups]);

  const logout = useCallback(async () => {
    await api("POST", "/api/auth/logout").catch(() => {});
    setUser(null);
    if (window.location.pathname !== "/" && window.location.pathname !== "/login") {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) body[k] = String(v);
    }
    const res = await api<{ settings: Record<string, string> }>("PUT", "/api/settings", body);
    setSettings(parseSettings(res.settings));
  }, []);

  // Initial load: check auth first.
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Property mutations ─────────────────────────────────────────────

  const createProperty = useCallback(async (data: NewProperty) => {
    const res = await api<{ property: Property }>("POST", "/api/properties", data);
    await refreshLookups();
    return res.property;
  }, [refreshLookups]);

  const updateProperty = useCallback(async (id: number, patch: Partial<NewProperty>) => {
    const res = await api<{ property: Property }>("PUT", `/api/properties/${id}`, patch);
    await refreshLookups();
    return res.property;
  }, [refreshLookups]);

  const deleteProperty = useCallback(async (id: number) => {
    await api("DELETE", `/api/properties/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Unit mutations ─────────────────────────────────────────────────

  const listUnits = useCallback(async (propertyId?: number): Promise<Unit[]> => {
    const path = propertyId ? `/api/units?property_id=${propertyId}` : "/api/units";
    const data = await api<{ units: Unit[] }>("GET", path);
    return data.units;
  }, []);

  const createUnit = useCallback(async (data: NewUnit) => {
    const res = await api<{ unit: Unit }>("POST", "/api/units", data);
    await refreshLookups();
    return res.unit;
  }, [refreshLookups]);

  const updateUnit = useCallback(async (id: number, patch: Partial<NewUnit>) => {
    const res = await api<{ unit: Unit }>("PUT", `/api/units/${id}`, patch);
    await refreshLookups();
    return res.unit;
  }, [refreshLookups]);

  const deleteUnit = useCallback(async (id: number) => {
    await api("DELETE", `/api/units/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Tenant mutations ───────────────────────────────────────────────

  const listTenants = useCallback(async (q?: string): Promise<Tenant[]> => {
    const path = q ? `/api/tenants?q=${encodeURIComponent(q)}` : "/api/tenants";
    const data = await api<{ tenants: Tenant[] }>("GET", path);
    return data.tenants;
  }, []);

  const createTenant = useCallback(async (data: NewTenant) => {
    const res = await api<{ tenant: Tenant }>("POST", "/api/tenants", data);
    return res.tenant;
  }, []);

  const updateTenant = useCallback(async (id: number, patch: Partial<NewTenant>) => {
    const res = await api<{ tenant: Tenant }>("PUT", `/api/tenants/${id}`, patch);
    return res.tenant;
  }, []);

  const deleteTenant = useCallback(async (id: number) => {
    await api("DELETE", `/api/tenants/${id}`);
  }, []);

  // Lease mutations ────────────────────────────────────────────────

  const listLeases = useCallback(async (params?: { tenant_id?: number; unit_id?: number; status?: string }): Promise<Lease[]> => {
    const qs = new URLSearchParams();
    if (params?.tenant_id) qs.set("tenant_id", String(params.tenant_id));
    if (params?.unit_id) qs.set("unit_id", String(params.unit_id));
    if (params?.status) qs.set("status", params.status);
    const path = qs.toString() ? `/api/leases?${qs.toString()}` : "/api/leases";
    const data = await api<{ leases: Lease[] }>("GET", path);
    return data.leases;
  }, []);

  const createLease = useCallback(async (data: NewLease) => {
    const res = await api<{ lease: Lease }>("POST", "/api/leases", data);
    await refreshLookups();
    return res.lease;
  }, [refreshLookups]);

  const updateLease = useCallback(async (id: number, patch: Partial<NewLease>) => {
    const res = await api<{ lease: Lease }>("PUT", `/api/leases/${id}`, patch);
    await refreshLookups();
    return res.lease;
  }, [refreshLookups]);

  const deleteLease = useCallback(async (id: number) => {
    await api("DELETE", `/api/leases/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Rent / payments ────────────────────────────────────────────────

  const listCharges = useCallback(async (period?: string): Promise<RentCharge[]> => {
    const path = period ? `/api/rent-charges?period=${encodeURIComponent(period)}` : "/api/rent-charges";
    const data = await api<{ charges: RentCharge[] }>("GET", path);
    return data.charges;
  }, []);

  const generateCharges = useCallback(async (period: string) => {
    const data = await api<{ created: number; period: string }>("POST", "/api/rent-charges/generate", { period });
    return data;
  }, []);

  const recordPayment = useCallback(async (input: {
    charge_id: number;
    amount: number;
    method?: string;
    reference?: string | null;
    notes?: string | null;
    paid_at?: string;
  }) => {
    const res = await api<{ charge: RentCharge }>("POST", "/api/payments", input);
    return res.charge;
  }, []);

  // Vendor mutations ───────────────────────────────────────────────

  const createVendor = useCallback(async (data: NewVendor) => {
    const res = await api<{ vendor: Vendor }>("POST", "/api/vendors", data);
    await refreshLookups();
    return res.vendor;
  }, [refreshLookups]);

  const updateVendor = useCallback(async (id: number, patch: Partial<NewVendor>) => {
    const res = await api<{ vendor: Vendor }>("PUT", `/api/vendors/${id}`, patch);
    await refreshLookups();
    return res.vendor;
  }, [refreshLookups]);

  const deleteVendor = useCallback(async (id: number) => {
    await api("DELETE", `/api/vendors/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Work order mutations ───────────────────────────────────────────

  const listWorkOrders = useCallback(async (params?: { status?: string; property_id?: number }): Promise<WorkOrder[]> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    const path = qs.toString() ? `/api/work-orders?${qs.toString()}` : "/api/work-orders";
    const data = await api<{ work_orders: WorkOrder[] }>("GET", path);
    return data.work_orders;
  }, []);

  const createWorkOrder = useCallback(async (data: NewWorkOrder) => {
    const res = await api<{ work_order: WorkOrder }>("POST", "/api/work-orders", data);
    return res.work_order;
  }, []);

  const updateWorkOrder = useCallback(async (id: number, patch: Partial<NewWorkOrder>) => {
    const res = await api<{ work_order: WorkOrder }>("PUT", `/api/work-orders/${id}`, patch);
    return res.work_order;
  }, []);

  const deleteWorkOrder = useCallback(async (id: number) => {
    await api("DELETE", `/api/work-orders/${id}`);
  }, []);

  return {
    // auth
    user, authLoading, needsSetup,
    login, register, logout, checkAuth, setUser,
    // data
    properties, vendors, settings,
    loading, error, setError,
    // refresh
    refreshLookups,
    // settings
    updateSettings,
    // properties / units
    createProperty, updateProperty, deleteProperty,
    listUnits, createUnit, updateUnit, deleteUnit,
    // tenants
    listTenants, createTenant, updateTenant, deleteTenant,
    // leases
    listLeases, createLease, updateLease, deleteLease,
    // rent
    listCharges, generateCharges, recordPayment,
    // vendors
    createVendor, updateVendor, deleteVendor,
    // work orders
    listWorkOrders, createWorkOrder, updateWorkOrder, deleteWorkOrder,
  };
}

export type AppStateValue = ReturnType<typeof useAppState>;
