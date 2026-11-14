import { supabase } from "./supabase";
import {
  mapLandlord,
  mapProperty,
  mapUnit,
  mapTenant,
  mapLease,
  mapCharge,
  mapPayment,
  mapVendor,
  mapWorkOrder,
  mapApplication,
  propertyToInsert,
  propertyTypeToDb,
  unitReadinessToDb,
  unitStatusToDb,
  workOrderStatusToDb,
  workOrderPriorityToDb,
  workOrderStatusFromDb,
  workOrderPriorityFromDb,
  WORK_ORDER_OPEN_STATUSES_DB,
  maintenanceCategoryToDb,
} from "./mappers";
import type {
  Landlord,
  Property,
  Unit,
  Tenant,
  Lease,
  RentCharge,
  Payment,
  Vendor,
  WorkOrder,
  Application,
  NewProperty,
  NewUnit,
  NewTenant,
  NewLease,
  NewWorkOrder,
  NewVendor,
  NewLandlord,
  NewApplication,
  DashboardSummary,
  UnitStatus,
  WorkOrderStatus,
  ApplicationStatus,
  MaintenancePhoto,
  MaintenanceComment,
  MaintenanceStatusEvent,
  CommentVisibility,
  MaintenanceCategory,
  WorkOrderPriority,
  TenantHomeContext,
  PropertyDocument,
  DocumentVisibility,
} from "../types";
import type { AccountStatus, AppRole, Tables } from "../types.supabase";

export interface UserAccountRow {
  user_id: string;
  email: string | null;
  role: AppRole | null;
  landlord_id: number | null;
  tenant_id: number | null;
  staff_id: number | null;
  account_status: AccountStatus;
  created_at: string;
  /**
   * From list RPC after migration 20261114070000.
   * `null` = unconfirmed (UI blocks Approve). `undefined` = column absent
   * (FE ahead of live mig) — do not block UI; server enforces after apply.
   */
  email_confirmed_at?: string | null;
}

export interface StaffMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
}

function throwSb(error: { message: string } | null): never {
  throw new Error(error?.message || "Supabase request failed");
}

/** PostgREST default max-rows is 1000 — page so list/KPI paths are not silently truncated. */
const REST_PAGE_SIZE = 1000;

async function selectAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + REST_PAGE_SIZE - 1);
    if (error) throwSb(error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < REST_PAGE_SIZE) break;
  }
  return out;
}

async function assertOk<T>(result: { data: T; error: { message: string } | null }): Promise<T> {
  if (result.error) throwSb(result.error);
  return result.data;
}

// ── Landlords ─────────────────────────────────────────────────────

export async function listLandlords(): Promise<Landlord[]> {
  const { data, error } = await supabase.from("Landlords").select("*").order("last_name");
  if (error) throwSb(error);
  return (data ?? []).map(mapLandlord);
}

export async function getLandlord(id: number): Promise<Landlord> {
  const { data, error } = await supabase.from("Landlords").select("*").eq("id", id).single();
  if (error) throwSb(error);
  return mapLandlord(data!);
}

export async function createLandlord(input: NewLandlord): Promise<Landlord> {
  const { data, error } = await supabase
    .from("Landlords")
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      company_name: input.company_name ?? null,
      mobile_phone: input.phone ?? null,
      preferred_contact: input.preferred_contact ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapLandlord(data!);
}

export async function updateLandlord(id: number, patch: Partial<NewLandlord>): Promise<Landlord> {
  const row: Record<string, unknown> = {};
  if (patch.first_name !== undefined) row.first_name = patch.first_name;
  if (patch.last_name !== undefined) row.last_name = patch.last_name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.company_name !== undefined) row.company_name = patch.company_name;
  if (patch.phone !== undefined) row.mobile_phone = patch.phone;
  if (patch.preferred_contact !== undefined) row.preferred_contact = patch.preferred_contact;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { data, error } = await supabase.from("Landlords").update(row as never).eq("id", id).select("*").single();
  if (error) throwSb(error);
  return mapLandlord(data!);
}

export async function deleteLandlord(id: number): Promise<void> {
  const { error } = await supabase.from("Landlords").delete().eq("id", id);
  if (error) throwSb(error);
}

// ── Properties ────────────────────────────────────────────────────

export async function listProperties(): Promise<Property[]> {
  const [{ data: props, error: pErr }, { data: units, error: uErr }, { data: landlords, error: lErr }] =
    await Promise.all([
      supabase.from("Properties").select("*").order("property_name"),
      supabase.from("Units").select("id, property_id, status"),
      supabase.from("Landlords").select("id, first_name, last_name, company_name"),
    ]);
  if (pErr) throwSb(pErr);
  if (uErr) throwSb(uErr);
  if (lErr) throwSb(lErr);

  const landlordName = new Map(
    (landlords ?? []).map((l) => [
      l.id,
      l.company_name?.trim() || `${l.first_name} ${l.last_name}`.trim(),
    ]),
  );

  return (props ?? []).map((p) => {
    const punits = (units ?? []).filter((u) => u.property_id === p.id);
    const occupied = punits.filter((u) => lower(u.status) === "occupied").length;
    return mapProperty(p, {
      unit_count: punits.length,
      occupied_count: occupied,
      landlord_name: landlordName.get(p.landlord_id) ?? null,
    });
  });
}

function lower(s: string): string {
  return s.trim().toLowerCase();
}

export async function getProperty(id: number): Promise<Property> {
  const { data, error } = await supabase.from("Properties").select("*").eq("id", id).single();
  if (error) throwSb(error);
  let landlord_name: string | null = null;
  if (data!.landlord_id) {
    const { data: l } = await supabase
      .from("Landlords")
      .select("first_name, last_name, company_name")
      .eq("id", data!.landlord_id)
      .maybeSingle();
    if (l) landlord_name = l.company_name?.trim() || `${l.first_name} ${l.last_name}`.trim();
  }
  const { data: units } = await supabase.from("Units").select("id, status").eq("property_id", id);
  const occupied = (units ?? []).filter((u) => lower(u.status) === "occupied").length;
  return mapProperty(data!, {
    unit_count: units?.length ?? 0,
    occupied_count: occupied,
    landlord_name,
  });
}

export async function createProperty(input: NewProperty): Promise<Property> {
  if (!input.landlord_id) throw new Error("landlord_id is required");
  const row = propertyToInsert({
    name: input.name,
    type: input.type,
    address: input.address,
    city: input.city,
    state: input.state,
    zip: input.zip,
    year_built: input.year_built,
    notes: input.notes,
    color: input.color,
    landlord_id: input.landlord_id,
  });
  const { data, error } = await supabase.from("Properties").insert(row).select("*").single();
  if (error) throwSb(error);
  return mapProperty(data!);
}

export async function updateProperty(id: number, patch: Partial<NewProperty>): Promise<Property> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.property_name = patch.name;
  if (patch.type !== undefined) row.property_type = propertyTypeToDb(patch.type);
  if (patch.address !== undefined) row.street_address = patch.address?.trim() || "TBD";
  if (patch.city !== undefined) row.city = patch.city?.trim() || "TBD";
  if (patch.state !== undefined) row.state = patch.state?.trim() || "MD";
  if (patch.zip !== undefined) row.zip = patch.zip?.trim() || "00000";
  if (patch.year_built !== undefined) row.year_built = patch.year_built;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.landlord_id !== undefined) {
    if (!patch.landlord_id) throw new Error("landlord_id is required");
    row.landlord_id = patch.landlord_id;
  }
  const { data, error } = await supabase.from("Properties").update(row as never).eq("id", id).select("*").single();
  if (error) throwSb(error);
  return mapProperty(data!);
}

export async function deleteProperty(id: number): Promise<void> {
  // Remove storage objects before CASCADE deletes PropertyDocuments rows.
  // Under path-bound DELETE, remove must succeed while rows still exist; confirm
  // absence like deletePropertyDocument so a silent no-op cannot leave orphans.
  const { data: docs, error: docsErr } = await supabase
    .from("PropertyDocuments")
    .select("storage_path")
    .eq("property_id", id);
  if (docsErr) throwSb(docsErr);
  const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
  if (paths.length > 0) {
    const { data: removed, error: rmErr } = await supabase.storage
      .from("property-documents")
      .remove(paths);
    const removedSet = new Set((removed ?? []).map((o) => o.name));
    for (const path of paths) {
      if (removedSet.has(path)) continue;
      const presence = await propertyDocumentStoragePresence(path);
      if (presence === "present") {
        throw new Error(rmErr?.message || `Failed to remove document from storage: ${path}`);
      }
      if (presence === "unknown") {
        throw new Error(
          rmErr?.message ||
            `Could not confirm storage removal for ${path}; property left unchanged.`,
        );
      }
    }
  }

  const { error } = await supabase.from("Properties").delete().eq("id", id);
  if (error) throwSb(error);
}

// ── Units ─────────────────────────────────────────────────────────

export async function listUnits(propertyId?: number): Promise<Unit[]> {
  let q = supabase.from("Units").select("*").order("unit_label");
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data: units, error } = await q;
  if (error) throwSb(error);

  const propIds = [...new Set((units ?? []).map((u) => u.property_id))];
  const { data: props } = propIds.length
    ? await supabase.from("Properties").select("id, property_name, color, street_address, city").in("id", propIds)
    : { data: [] as { id: number; property_name: string | null; color: string; street_address: string; city: string }[] };

  const propMap = new Map((props ?? []).map((p) => [p.id, p]));

  const unitIds = (units ?? []).map((u) => u.id);
  const { data: leases } = unitIds.length
    ? await supabase
        .from("Leases")
        .select("id, unit_id, primary_tenant_id, status")
        .in("unit_id", unitIds)
        .eq("status", "active")
    : { data: [] as { id: number; unit_id: number; primary_tenant_id: number | null; status: string }[] };

  const leaseByUnit = new Map((leases ?? []).map((l) => [l.unit_id, l]));
  const tenantIds = [...new Set((leases ?? []).map((l) => l.primary_tenant_id).filter(Boolean))] as number[];
  const { data: tenants } = tenantIds.length
    ? await supabase.from("Tenants").select("id, first_name, last_name").in("id", tenantIds)
    : { data: [] as { id: number; first_name: string; last_name: string }[] };
  const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

  return (units ?? []).map((u) => {
    const p = propMap.get(u.property_id);
    const lease = leaseByUnit.get(u.id);
    const t = lease?.primary_tenant_id ? tenantMap.get(lease.primary_tenant_id) : undefined;
    return mapUnit(u, {
      property_name: p?.property_name,
      property_color: p?.color,
      property_address: p?.street_address,
      property_city: p?.city,
      active_lease_id: lease?.id ?? null,
      active_tenant_name: t ? `${t.first_name} ${t.last_name}` : null,
    });
  });
}

export async function createUnit(input: NewUnit): Promise<Unit> {
  const { data, error } = await supabase
    .from("Units")
    .insert({
      property_id: input.property_id,
      unit_label: input.name,
      bedrooms: input.bedrooms ?? 1,
      bathrooms: input.bathrooms ?? 1,
      sqft: input.sqft ?? null,
      market_rent: input.market_rent ?? 0,
      status: unitStatusToDb((input.status as UnitStatus) ?? "vacant"),
      readiness_status: unitReadinessToDb(input.readiness_status ?? "ready"),
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapUnit(data!);
}

export async function updateUnit(id: number, patch: Partial<NewUnit>): Promise<Unit> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.unit_label = patch.name;
  if (patch.property_id !== undefined) row.property_id = patch.property_id;
  if (patch.bedrooms !== undefined) row.bedrooms = patch.bedrooms;
  if (patch.bathrooms !== undefined) row.bathrooms = patch.bathrooms;
  if (patch.sqft !== undefined) row.sqft = patch.sqft;
  if (patch.market_rent !== undefined) row.market_rent = patch.market_rent;
  if (patch.status !== undefined) row.status = unitStatusToDb(patch.status as UnitStatus);
  if (patch.readiness_status !== undefined) row.readiness_status = unitReadinessToDb(patch.readiness_status);
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { data, error } = await supabase.from("Units").update(row as never).eq("id", id).select("*").single();
  if (error) throwSb(error);
  return mapUnit(data!);
}

export async function deleteUnit(id: number): Promise<void> {
  const { error } = await supabase.from("Units").delete().eq("id", id);
  if (error) throwSb(error);
}

// ── Tenants ───────────────────────────────────────────────────────

export async function listTenants(q?: string): Promise<Tenant[]> {
  const { data, error } = await supabase.from("Tenants").select("*").order("last_name");
  if (error) throwSb(error);
  let rows = data ?? [];
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter(
      (t) =>
        t.first_name.toLowerCase().includes(needle) ||
        t.last_name.toLowerCase().includes(needle) ||
        (t.email && t.email.toLowerCase().includes(needle)),
    );
  }

  const unitIds = [...new Set(rows.map((t) => t.unit_id).filter(Boolean))] as number[];
  const { data: units } = unitIds.length
    ? await supabase.from("Units").select("id, unit_label, property_id").in("id", unitIds)
    : { data: [] as { id: number; unit_label: string; property_id: number }[] };
  const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
  const propIds = [...new Set((units ?? []).map((u) => u.property_id))];
  const { data: props } = propIds.length
    ? await supabase.from("Properties").select("id, property_name").in("id", propIds)
    : { data: [] as { id: number; property_name: string | null }[] };
  const propMap = new Map((props ?? []).map((p) => [p.id, p]));

  return rows.map((t) => {
    const u = t.unit_id ? unitMap.get(t.unit_id) : undefined;
    const p = u ? propMap.get(u.property_id) : undefined;
    return mapTenant(t, {
      active_unit_id: t.unit_id,
      active_unit_name: u?.unit_label,
      active_property_name: p?.property_name,
    });
  });
}

export async function getTenant(id: number): Promise<Tenant> {
  const list = await listTenants();
  const t = list.find((x) => x.id === id);
  if (!t) throw new Error("Tenant not found");
  return t;
}

export async function createTenant(input: NewTenant): Promise<Tenant> {
  const email = input.email?.trim();
  if (!email) throw new Error("Email is required");
  const { data, error } = await supabase
    .from("Tenants")
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      email,
      mobile_phone: input.phone ?? null,
      date_of_birth: input.date_of_birth ?? null,
      emergency_contact: input.emergency_contact ?? null,
      employer: input.employer ?? null,
      monthly_income: input.monthly_income ?? null,
      notes: input.notes ?? null,
      primary_on_lease: false,
      invite_to_app: false,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapTenant(data!);
}

export async function updateTenant(id: number, patch: Partial<NewTenant>): Promise<Tenant> {
  const row: Record<string, unknown> = {};
  if (patch.first_name !== undefined) row.first_name = patch.first_name;
  if (patch.last_name !== undefined) row.last_name = patch.last_name;
  if (patch.email !== undefined) {
    if (!patch.email?.trim()) throw new Error("Email is required");
    row.email = patch.email.trim();
  }
  if (patch.phone !== undefined) row.mobile_phone = patch.phone;
  if (patch.date_of_birth !== undefined) row.date_of_birth = patch.date_of_birth;
  if (patch.emergency_contact !== undefined) row.emergency_contact = patch.emergency_contact;
  if (patch.employer !== undefined) row.employer = patch.employer;
  if (patch.monthly_income !== undefined) row.monthly_income = patch.monthly_income;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { data, error } = await supabase.from("Tenants").update(row as never).eq("id", id).select("*").single();
  if (error) throwSb(error);
  return mapTenant(data!);
}

export async function deleteTenant(id: number): Promise<void> {
  const { error } = await supabase.from("Tenants").delete().eq("id", id);
  if (error) throwSb(error);
}

// ── Leases ────────────────────────────────────────────────────────

export async function listLeases(params?: {
  tenant_id?: number;
  unit_id?: number;
  status?: string;
  /** When set, only these lease ids are loaded (avoids full-table enrich for charge lists). */
  ids?: number[];
}): Promise<Lease[]> {
  let q = supabase.from("Leases").select("*").order("start_date", { ascending: false });
  if (params?.unit_id) q = q.eq("unit_id", params.unit_id);
  if (params?.status) q = q.eq("status", params.status);
  if (params?.tenant_id) q = q.eq("primary_tenant_id", params.tenant_id);
  if (params?.ids !== undefined) {
    if (params.ids.length === 0) return [];
    q = q.in("id", params.ids);
  }
  const { data: leases, error } = await q;
  if (error) throwSb(error);

  const unitIds = [...new Set((leases ?? []).map((l) => l.unit_id))];
  const tenantIds = [
    ...new Set((leases ?? []).map((l) => l.primary_tenant_id).filter(Boolean)),
  ] as number[];

  const [{ data: units }, { data: tenants }] = await Promise.all([
    unitIds.length
      ? supabase.from("Units").select("id, unit_label, property_id").in("id", unitIds)
      : Promise.resolve({ data: [] as { id: number; unit_label: string; property_id: number }[] }),
    tenantIds.length
      ? supabase.from("Tenants").select("id, first_name, last_name, email, mobile_phone").in("id", tenantIds)
      : Promise.resolve({
          data: [] as {
            id: number;
            first_name: string;
            last_name: string;
            email: string;
            mobile_phone: string | null;
          }[],
        }),
  ]);
  const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
  const propIds = [...new Set((units ?? []).map((u) => u.property_id))];
  const { data: props } = propIds.length
    ? await supabase.from("Properties").select("id, property_name, color").in("id", propIds)
    : { data: [] as { id: number; property_name: string | null; color: string }[] };
  const propMap = new Map((props ?? []).map((p) => [p.id, p]));
  const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

  return (leases ?? []).map((l) => {
    const u = unitMap.get(l.unit_id);
    const p = u ? propMap.get(u.property_id) : undefined;
    const t = l.primary_tenant_id ? tenantMap.get(l.primary_tenant_id) : undefined;
    return mapLease(l, {
      unit_name: u?.unit_label,
      property_id: u?.property_id,
      property_name: p?.property_name,
      property_color: p?.color,
      tenant_first_name: t?.first_name,
      tenant_last_name: t?.last_name,
      tenant_email: t?.email,
      tenant_phone: t?.mobile_phone,
    });
  });
}

/**
 * Gap R3 — keep Tenants.unit_id + LeaseTenants aligned with Leases.primary_tenant_id.
 * Product rule on delete/unlink: clear unit_id (and primary_on_lease) when it still
 * matches the lease unit — do not auto-reassign to another lease.
 */
async function linkPrimaryTenantToLease(
  leaseId: number,
  unitId: number,
  primaryTenantId: number,
): Promise<void> {
  const { error: ltErr } = await supabase.from("LeaseTenants").upsert({
    lease_id: leaseId,
    tenant_id: primaryTenantId,
  });
  if (ltErr) throwSb(ltErr);
  const { error: tErr } = await supabase
    .from("Tenants")
    .update({ unit_id: unitId, primary_on_lease: true } as never)
    .eq("id", primaryTenantId);
  if (tErr) throwSb(tErr);
}

/** Clear unit_id only when it still equals the lease unit (conditional update avoids races). */
async function clearTenantUnitsMatching(tenantIds: number[], leaseUnitId: number): Promise<void> {
  if (tenantIds.length === 0) return;
  const { error } = await supabase
    .from("Tenants")
    .update({ unit_id: null, primary_on_lease: false } as never)
    .in("id", tenantIds)
    .eq("unit_id", leaseUnitId);
  if (error) throwSb(error);
}

/**
 * After deleting a lease, clear unit_id only for tenants who are not on another lease
 * (membership or primary). A concurrent replacement lease on the same unit would share
 * unit_id — clearing by unit match alone would wipe that new assignment.
 */
async function clearTenantUnitsAfterLeaseDelete(
  tenantIds: number[],
  leaseUnitId: number,
): Promise<void> {
  if (tenantIds.length === 0) return;

  const [{ data: members, error: mErr }, { data: primaries, error: pErr }] = await Promise.all([
    supabase.from("LeaseTenants").select("tenant_id").in("tenant_id", tenantIds),
    supabase.from("Leases").select("primary_tenant_id").in("primary_tenant_id", tenantIds),
  ]);
  if (mErr) throwSb(mErr);
  if (pErr) throwSb(pErr);

  const keep = new Set<number>([
    ...(members ?? []).map((m) => m.tenant_id),
    ...(primaries ?? [])
      .map((p) => p.primary_tenant_id)
      .filter((id): id is number => id != null),
  ]);
  const toClear = tenantIds.filter((id) => !keep.has(id));
  await clearTenantUnitsMatching(toClear, leaseUnitId);
}

async function unlinkTenantFromLease(
  leaseId: number,
  tenantId: number,
  leaseUnitId: number,
): Promise<void> {
  const { error: ltErr } = await supabase
    .from("LeaseTenants")
    .delete()
    .eq("lease_id", leaseId)
    .eq("tenant_id", tenantId);
  if (ltErr) throwSb(ltErr);
  await clearTenantUnitsMatching([tenantId], leaseUnitId);
}

/**
 * Set LeaseTenants members to the lease unit unconditionally (no source-unit filter).
 * Avoids stale beforeUnit races where a concurrent update already moved occupants.
 */
async function setOccupantsUnit(
  leaseId: number,
  unitId: number,
  skipTenantId: number | null,
): Promise<void> {
  const { data: members, error: mErr } = await supabase
    .from("LeaseTenants")
    .select("tenant_id")
    .eq("lease_id", leaseId);
  if (mErr) throwSb(mErr);
  const ids = (members ?? [])
    .map((m) => m.tenant_id)
    .filter((tid) => skipTenantId == null || tid !== skipTenantId);
  if (ids.length === 0) return;
  const { error: tErr } = await supabase
    .from("Tenants")
    .update({ unit_id: unitId } as never)
    .in("id", ids);
  if (tErr) throwSb(tErr);
}

/** Compare-and-swap predicate so concurrent updateLease calls serialize on the lease row. */
function leaseCasFilter(
  query: {
    eq: (column: string, value: unknown) => typeof query;
    is: (column: string, value: null) => typeof query;
  },
  expected: { unit_id: number; primary_tenant_id: number | null },
) {
  let q = query.eq("unit_id", expected.unit_id);
  if (expected.primary_tenant_id == null) {
    q = q.is("primary_tenant_id", null);
  } else {
    q = q.eq("primary_tenant_id", expected.primary_tenant_id);
  }
  return q;
}

const LEASE_CONCURRENT_MSG = "Lease was modified by another update; please retry";

/** Abort if another update already moved the lease past our expected after-state. */
async function assertLeaseLinkState(
  leaseId: number,
  expected: { unit_id: number; primary_tenant_id: number | null },
): Promise<void> {
  const { data, error } = await supabase
    .from("Leases")
    .select("unit_id, primary_tenant_id")
    .eq("id", leaseId)
    .maybeSingle();
  if (error) throwSb(error);
  if (!data) throw new Error("Lease not found");
  const primary = (data.primary_tenant_id as number | null) ?? null;
  if (data.unit_id !== expected.unit_id || primary !== expected.primary_tenant_id) {
    throw new Error(LEASE_CONCURRENT_MSG);
  }
}

async function syncLeaseTenantLinks(args: {
  leaseId: number;
  beforeUnit: number;
  beforePrimary: number | null;
  afterUnit: number;
  afterPrimary: number | null;
}): Promise<void> {
  const { leaseId, beforeUnit, beforePrimary, afterUnit, afterPrimary } = args;
  const after = { unit_id: afterUnit, primary_tenant_id: afterPrimary };

  // Bail if a newer CAS already superseded us before we write tenants.
  await assertLeaseLinkState(leaseId, after);

  if (beforePrimary != null && beforePrimary !== afterPrimary) {
    await unlinkTenantFromLease(leaseId, beforePrimary, beforeUnit);
    await assertLeaseLinkState(leaseId, after);
  }

  if (afterPrimary != null) {
    await linkPrimaryTenantToLease(leaseId, afterUnit, afterPrimary);
    await assertLeaseLinkState(leaseId, after);
  }

  // Converge members to the lease unit with no beforeUnit filter; re-check before and
  // after so a slower sync cannot leave occupants on a stale afterUnit if a newer
  // CAS winner already moved the lease (post-write assert → repairSupersededLeaseSync).
  await assertLeaseLinkState(leaseId, after);
  await setOccupantsUnit(leaseId, afterUnit, afterPrimary);
  await assertLeaseLinkState(leaseId, after);
}

/**
 * When a slower sync is superseded mid-flight, it may have already upserted a
 * replaced primary into LeaseTenants / set occupant units. Remove those stale
 * writes and re-converge to the *current* lease state — never overwrite the
 * newer lease row. Re-reads + post-write assert with retry so a second concurrent
 * update cannot leave repair applying an obsolete snapshot.
 */
async function repairSupersededLeaseSync(
  leaseId: number,
  afterPrimary: number | null,
  afterUnit: number,
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: lease, error } = await supabase
      .from("Leases")
      .select("unit_id, primary_tenant_id")
      .eq("id", leaseId)
      .maybeSingle();
    if (error) throwSb(error);
    if (!lease) {
      // Lease deleted under us — only clear our stale afterPrimary unit if still set.
      if (afterPrimary != null) {
        await clearTenantUnitsMatching([afterPrimary], afterUnit);
      }
      return;
    }

    const currentPrimary = (lease.primary_tenant_id as number | null) ?? null;
    const currentUnit = lease.unit_id as number;
    const expected = { unit_id: currentUnit, primary_tenant_id: currentPrimary };

    if (afterPrimary != null && afterPrimary !== currentPrimary) {
      const { error: ltErr } = await supabase
        .from("LeaseTenants")
        .delete()
        .eq("lease_id", leaseId)
        .eq("tenant_id", afterPrimary);
      if (ltErr) throwSb(ltErr);
      await clearTenantUnitsMatching([afterPrimary], afterUnit);
    }

    await setOccupantsUnit(leaseId, currentUnit, currentPrimary);
    if (currentPrimary != null) {
      await linkPrimaryTenantToLease(leaseId, currentUnit, currentPrimary);
    }

    try {
      await assertLeaseLinkState(leaseId, expected);
      return;
    } catch {
      // Lease moved again mid-repair — retry with a fresh snapshot.
    }
  }
  throw new Error(LEASE_CONCURRENT_MSG);
}

/**
 * Best-effort undo after a partial syncLeaseTenantLinks failure (no DB transaction).
 * Only restores if the lease row still matches our after-state (won't clobber a newer winner).
 */
async function compensateLeaseTenantLinkSync(args: {
  leaseId: number;
  beforeUnit: number;
  beforePrimary: number | null;
  afterUnit: number;
  afterPrimary: number | null;
}): Promise<void> {
  const { leaseId, beforeUnit, beforePrimary, afterUnit, afterPrimary } = args;

  let restore = supabase
    .from("Leases")
    .update({
      unit_id: beforeUnit,
      primary_tenant_id: beforePrimary,
    } as never)
    .eq("id", leaseId);
  restore = leaseCasFilter(restore as never, {
    unit_id: afterUnit,
    primary_tenant_id: afterPrimary,
  }) as typeof restore;
  const { data: restored, error: leaseErr } = await restore.select("id").maybeSingle();
  if (leaseErr) throwSb(leaseErr);
  if (!restored) {
    // Another update won — scrub any stale memberships we may have written.
    await repairSupersededLeaseSync(leaseId, afterPrimary, afterUnit);
    return;
  }

  if (afterPrimary != null && afterPrimary !== beforePrimary) {
    const { error: ltErr } = await supabase
      .from("LeaseTenants")
      .delete()
      .eq("lease_id", leaseId)
      .eq("tenant_id", afterPrimary);
    if (ltErr) throwSb(ltErr);
    await clearTenantUnitsMatching([afterPrimary], afterUnit);
  }

  await setOccupantsUnit(leaseId, beforeUnit, null);

  if (beforePrimary != null) {
    await linkPrimaryTenantToLease(leaseId, beforeUnit, beforePrimary);
  }
}

export async function createLease(input: NewLease): Promise<Lease> {
  const { data, error } = await supabase
    .from("Leases")
    .insert({
      unit_id: input.unit_id,
      primary_tenant_id: input.primary_tenant_id ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      monthly_rent: input.monthly_rent ?? 0,
      deposit: input.deposit ?? 0,
      rent_due_day: input.rent_due_day ?? 1,
      late_fee: input.late_fee ?? 0,
      status: input.status ?? "active",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  if (input.primary_tenant_id) {
    try {
      await linkPrimaryTenantToLease(data!.id, input.unit_id, input.primary_tenant_id);
    } catch (err) {
      await supabase.from("LeaseTenants").delete().eq("lease_id", data!.id);
      await supabase.from("Leases").delete().eq("id", data!.id);
      throw err;
    }
  }
  const list = await listLeases();
  return list.find((l) => l.id === data!.id) ?? mapLease(data!);
}

export async function updateLease(id: number, patch: Partial<NewLease>): Promise<Lease> {
  const needsLinkSync =
    patch.unit_id !== undefined || patch.primary_tenant_id !== undefined;

  let before: { unit_id: number; primary_tenant_id: number | null } | null = null;
  if (needsLinkSync) {
    const { data: existing, error: existingErr } = await supabase
      .from("Leases")
      .select("unit_id, primary_tenant_id")
      .eq("id", id)
      .single();
    if (existingErr) throwSb(existingErr);
    before = existing!;
  }

  const row: Record<string, unknown> = {};
  for (const key of [
    "unit_id",
    "primary_tenant_id",
    "start_date",
    "end_date",
    "monthly_rent",
    "deposit",
    "rent_due_day",
    "late_fee",
    "status",
    "notes",
  ] as const) {
    if (patch[key] !== undefined) row[key] = patch[key];
  }

  // Serialize concurrent link-affecting updates with a CAS on unit + primary.
  let updateQuery = supabase.from("Leases").update(row as never).eq("id", id);
  if (needsLinkSync && before) {
    updateQuery = leaseCasFilter(updateQuery as never, before) as typeof updateQuery;
  }
  const { data, error } = await updateQuery.select("*").maybeSingle();
  if (error) throwSb(error);
  if (!data) {
    if (needsLinkSync) {
      throw new Error(LEASE_CONCURRENT_MSG);
    }
    throw new Error("Lease not found");
  }

  if (needsLinkSync && before) {
    const afterUnit = data.unit_id as number;
    const afterPrimary = (data.primary_tenant_id as number | null) ?? null;
    try {
      await syncLeaseTenantLinks({
        leaseId: id,
        beforeUnit: before.unit_id,
        beforePrimary: before.primary_tenant_id,
        afterUnit,
        afterPrimary,
      });
    } catch (syncErr) {
      // Best-effort: roll back if we still own after-state; else scrub stale writes only.
      try {
        const superseded =
          syncErr instanceof Error && syncErr.message === LEASE_CONCURRENT_MSG;
        if (superseded) {
          await repairSupersededLeaseSync(id, afterPrimary, afterUnit);
        } else {
          await compensateLeaseTenantLinkSync({
            leaseId: id,
            beforeUnit: before.unit_id,
            beforePrimary: before.primary_tenant_id,
            afterUnit,
            afterPrimary,
          });
        }
      } catch {
        /* keep original sync error */
      }
      throw syncErr;
    }
  }

  const list = await listLeases();
  return list.find((l) => l.id === id) ?? mapLease(data);
}

export async function deleteLease(id: number): Promise<void> {
  const { data: lease, error: leaseReadErr } = await supabase
    .from("Leases")
    .select("id, unit_id, primary_tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (leaseReadErr) throwSb(leaseReadErr);
  if (!lease) {
    throw new Error("Lease not found");
  }

  const snapshot = {
    unit_id: lease.unit_id as number,
    primary_tenant_id: (lease.primary_tenant_id as number | null) ?? null,
  };

  const { data: members, error: membersErr } = await supabase
    .from("LeaseTenants")
    .select("tenant_id")
    .eq("lease_id", id);
  if (membersErr) throwSb(membersErr);

  const tenantIds = [...new Set<number>([
    ...(members ?? []).map((m) => m.tenant_id),
    ...(snapshot.primary_tenant_id != null ? [snapshot.primary_tenant_id] : []),
  ])];

  // CAS-delete the lease while still at the snapshot link state. LeaseTenants
  // cascade (ON DELETE CASCADE), so memberships go with the row — no clear-first
  // partial state, and a concurrent updateLease that already moved unit/primary wins.
  let del = supabase.from("Leases").delete().eq("id", id);
  del = leaseCasFilter(del as never, snapshot) as typeof del;
  const { data: deleted, error } = await del.select("id").maybeSingle();
  if (error) throwSb(error);
  if (!deleted) {
    throw new Error(LEASE_CONCURRENT_MSG);
  }

  // Clear unit links only after the lease is gone, and only if the tenant is not
  // already on a replacement (or other) lease — same unit_id must not be wiped.
  await clearTenantUnitsAfterLeaseDelete(tenantIds, snapshot.unit_id);
}

// ── Rent ──────────────────────────────────────────────────────────

/** Enrich one charge row with lease/unit/tenant display fields (no full charges refetch). */
async function enrichCharge(row: Tables<"RentCharges">): Promise<RentCharge> {
  const { data: leaseRow, error } = await supabase
    .from("Leases")
    .select("*")
    .eq("id", row.lease_id)
    .maybeSingle();
  if (error) throwSb(error);
  if (!leaseRow) return mapCharge(row);

  const [{ data: unit }, { data: tenant }] = await Promise.all([
    supabase.from("Units").select("id, unit_label, property_id").eq("id", leaseRow.unit_id).maybeSingle(),
    leaseRow.primary_tenant_id
      ? supabase
          .from("Tenants")
          .select("id, first_name, last_name, email, mobile_phone")
          .eq("id", leaseRow.primary_tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { data: prop } = unit
    ? await supabase.from("Properties").select("id, property_name, color").eq("id", unit.property_id).maybeSingle()
    : { data: null };

  return mapCharge(row, {
    unit_id: leaseRow.unit_id,
    lease_rent: Number(leaseRow.monthly_rent),
    rent_due_day: leaseRow.rent_due_day,
    unit_name: unit?.unit_label,
    property_id: unit?.property_id,
    property_name: prop?.property_name,
    property_color: prop?.color,
    tenant_id: leaseRow.primary_tenant_id,
    tenant_first_name: tenant?.first_name,
    tenant_last_name: tenant?.last_name,
  });
}

/** Chunk size for PostgREST `.in()` filters (URL length / practical batching). */
const IN_FILTER_CHUNK = 200;

/** Slim lease→unit→property→tenant enrich for charges (no full listLeases graph). */
async function loadChargeLeaseExtras(leaseIds: number[]): Promise<Map<number, Partial<RentCharge>>> {
  const extras = new Map<number, Partial<RentCharge>>();
  if (!leaseIds.length) return extras;

  type SlimLease = {
    id: number;
    unit_id: number;
    monthly_rent: number;
    rent_due_day: number;
    primary_tenant_id: number | null;
  };
  const leaseRows: SlimLease[] = [];
  for (let i = 0; i < leaseIds.length; i += IN_FILTER_CHUNK) {
    const chunk = leaseIds.slice(i, i + IN_FILTER_CHUNK);
    const { data, error } = await supabase
      .from("Leases")
      .select("id, unit_id, monthly_rent, rent_due_day, primary_tenant_id")
      .in("id", chunk);
    if (error) throwSb(error);
    leaseRows.push(...((data ?? []) as SlimLease[]));
  }

  const unitIds = [...new Set(leaseRows.map((l) => l.unit_id))];
  const tenantIds = [
    ...new Set(leaseRows.map((l) => l.primary_tenant_id).filter((id): id is number => id != null)),
  ];

  const [{ data: units, error: unitErr }, { data: tenants, error: tenantErr }] = await Promise.all([
    unitIds.length
      ? (async () => {
          const rows: { id: number; unit_label: string; property_id: number }[] = [];
          for (let i = 0; i < unitIds.length; i += IN_FILTER_CHUNK) {
            const chunk = unitIds.slice(i, i + IN_FILTER_CHUNK);
            const { data, error } = await supabase
              .from("Units")
              .select("id, unit_label, property_id")
              .in("id", chunk);
            if (error) return { data: null, error };
            rows.push(...(data ?? []));
          }
          return { data: rows, error: null };
        })()
      : Promise.resolve({
          data: [] as { id: number; unit_label: string; property_id: number }[],
          error: null,
        }),
    tenantIds.length
      ? (async () => {
          const rows: { id: number; first_name: string; last_name: string }[] = [];
          for (let i = 0; i < tenantIds.length; i += IN_FILTER_CHUNK) {
            const chunk = tenantIds.slice(i, i + IN_FILTER_CHUNK);
            const { data, error } = await supabase
              .from("Tenants")
              .select("id, first_name, last_name")
              .in("id", chunk);
            if (error) return { data: null, error };
            rows.push(...(data ?? []));
          }
          return { data: rows, error: null };
        })()
      : Promise.resolve({
          data: [] as { id: number; first_name: string; last_name: string }[],
          error: null,
        }),
  ]);
  if (unitErr) throwSb(unitErr);
  if (tenantErr) throwSb(tenantErr);

  const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
  const propIds = [...new Set((units ?? []).map((u) => u.property_id))];
  const props: { id: number; property_name: string | null; color: string }[] = [];
  for (let i = 0; i < propIds.length; i += IN_FILTER_CHUNK) {
    const chunk = propIds.slice(i, i + IN_FILTER_CHUNK);
    const { data, error } = await supabase
      .from("Properties")
      .select("id, property_name, color")
      .in("id", chunk);
    if (error) throwSb(error);
    props.push(...(data ?? []));
  }
  const propMap = new Map(props.map((p) => [p.id, p]));
  const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

  for (const lease of leaseRows) {
    const unit = unitMap.get(lease.unit_id);
    const prop = unit ? propMap.get(unit.property_id) : undefined;
    const tenant = lease.primary_tenant_id ? tenantMap.get(lease.primary_tenant_id) : undefined;
    extras.set(lease.id, {
      unit_id: lease.unit_id,
      lease_rent: Number(lease.monthly_rent),
      rent_due_day: lease.rent_due_day,
      unit_name: unit?.unit_label,
      property_id: unit?.property_id,
      property_name: prop?.property_name,
      property_color: prop?.color,
      tenant_id: lease.primary_tenant_id,
      tenant_first_name: tenant?.first_name,
      tenant_last_name: tenant?.last_name,
    });
  }
  return extras;
}

export async function listCharges(period?: string): Promise<RentCharge[]> {
  const charges = await selectAllPages<Tables<"RentCharges">>((from, to) => {
    let q = supabase.from("RentCharges").select("*").order("due_date", { ascending: false }).range(from, to);
    if (period) q = q.eq("period", period);
    return q;
  });

  const leaseIds = [...new Set(charges.map((c) => c.lease_id))];
  const leaseExtras = await loadChargeLeaseExtras(leaseIds);

  return charges.map((c) => mapCharge(c, leaseExtras.get(c.lease_id)));
}

export async function generateCharges(
  period: string,
): Promise<{ created: number; period: string; activeLeases: number }> {
  // Slim active-lease fetch — charge gen only needs id / rent / due day (no unit/tenant enrich).
  // Page past PostgREST max-rows so large portfolios are not silently truncated.
  const [leases, existingRows] = await Promise.all([
    selectAllPages<{ id: number; monthly_rent: number; rent_due_day: number }>((from, to) =>
      supabase
        .from("Leases")
        .select("id, monthly_rent, rent_due_day")
        .eq("status", "active")
        .range(from, to),
    ),
    selectAllPages<{ lease_id: number }>((from, to) =>
      supabase.from("RentCharges").select("lease_id").eq("period", period).range(from, to),
    ),
  ]);
  const activeLeases = leases.length;
  if (!activeLeases) return { created: 0, period, activeLeases: 0 };

  const existing = new Set(existingRows.map((r) => r.lease_id));

  const dueDayDefault = 1;
  const toInsert = leases
    .filter((lease) => !existing.has(lease.id))
    .map((lease) => {
      const dueDay = Math.min(lease.rent_due_day || dueDayDefault, 28);
      return {
        lease_id: lease.id,
        period,
        due_date: `${period}-${String(dueDay).padStart(2, "0")}`,
        amount: lease.monthly_rent,
        amount_paid: 0,
        status: "open",
      };
    });

  if (!toInsert.length) return { created: 0, period, activeLeases };

  // Batch upsert: UNIQUE(lease_id, period). ignoreDuplicates is load-bearing — never switch to
  // merge-duplicates (would overwrite amount_paid / status on races). RETURNING = inserted only.
  const { data: inserted, error: insertErr } = await supabase
    .from("RentCharges")
    .upsert(toInsert, {
      onConflict: "lease_id,period",
      ignoreDuplicates: true,
    })
    .select("id");
  if (insertErr) throwSb(insertErr);
  return { created: (inserted ?? []).length, period, activeLeases };
}

export async function listPayments(chargeId: number): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("Payments")
    .select("*")
    .eq("charge_id", chargeId)
    .order("paid_at", { ascending: false });
  if (error) throwSb(error);
  return (data ?? []).map(mapPayment);
}

export async function recordPayment(input: {
  charge_id: number;
  amount: number;
  method?: string;
  reference?: string | null;
  notes?: string | null;
  paid_at?: string;
}): Promise<RentCharge> {
  const { data: updated, error } = await supabase.rpc("record_payment", {
    p_charge_id: input.charge_id,
    p_amount: input.amount,
    p_method: input.method ?? "cash",
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_paid_at: input.paid_at ?? new Date().toISOString(),
  });
  if (error) throwSb(error);
  return enrichCharge(updated!);
}

export async function deletePayment(paymentId: number): Promise<RentCharge> {
  const { data: updated, error } = await supabase.rpc("delete_payment", {
    p_payment_id: paymentId,
  });
  if (error) throwSb(error);
  return enrichCharge(updated!);
}

// ── Vendors ───────────────────────────────────────────────────────

export async function listVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase.from("Vendors").select("*").order("name");
  if (error) throwSb(error);
  return (data ?? []).map(mapVendor);
}

export async function createVendor(input: NewVendor): Promise<Vendor> {
  const { data, error } = await supabase
    .from("Vendors")
    .insert({
      name: input.name,
      category: input.category ?? "general",
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      color: input.color ?? "slate",
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapVendor(data!);
}

export async function updateVendor(id: number, patch: Partial<NewVendor>): Promise<Vendor> {
  const row: Record<string, unknown> = {};
  for (const key of ["name", "category", "phone", "email", "notes", "color"] as const) {
    if (patch[key] !== undefined) row[key] = patch[key];
  }
  const { data, error } = await supabase.from("Vendors").update(row as never).eq("id", id).select("*").single();
  if (error) throwSb(error);
  return mapVendor(data!);
}

export async function deleteVendor(id: number): Promise<void> {
  const { error } = await supabase.from("Vendors").delete().eq("id", id);
  if (error) throwSb(error);
}

// ── Settings ──────────────────────────────────────────────────────

export async function getSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("Settings").select("key, value");
  if (error) throwSb(error);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

export async function updateSettings(patch: Record<string, string>): Promise<Record<string, string>> {
  for (const [key, value] of Object.entries(patch)) {
    const { error } = await supabase.from("Settings").upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    });
    if (error) throwSb(error);
  }
  return getSettings();
}

// ── Maintenance / work orders ─────────────────────────────────────

/** Staff/admin-only; RLS returns no rows for landlord/tenant (not an error). */
async function loadStaffNotesByRequestIds(
  requestIds: number[],
): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  if (requestIds.length === 0) return map;
  const { data, error } = await supabase
    .from("MaintenanceRequestStaffNotes")
    .select("maintenance_request_id, notes")
    .in("maintenance_request_id", requestIds);
  if (error) throwSb(error);
  for (const row of data ?? []) {
    map.set(row.maintenance_request_id, row.notes);
  }
  return map;
}

async function upsertStaffNotes(requestId: number, notes: string | null): Promise<void> {
  const { error } = await supabase.from("MaintenanceRequestStaffNotes").upsert({
    maintenance_request_id: requestId,
    notes: notes?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throwSb(error);
}

export async function listWorkOrders(params?: {
  status?: string;
  property_id?: number;
}): Promise<WorkOrder[]> {
  let q = supabase.from("MaintenanceRequests").select("*").order("created_at", { ascending: false });
  if (params?.property_id) q = q.eq("property_id", params.property_id);
  if (params?.status) q = q.eq("status", workOrderStatusToDb(params.status as WorkOrderStatus));
  const { data: rows, error } = await q;
  if (error) throwSb(error);

  const propIds = [...new Set((rows ?? []).map((r) => r.property_id).filter(Boolean))] as number[];
  const unitIds = [...new Set((rows ?? []).map((r) => r.unit_id).filter(Boolean))] as number[];
  const tenantIds = [
    ...new Set((rows ?? []).map((r) => r.submitted_by_tenant_id).filter(Boolean)),
  ] as number[];
  const vendorIds = [...new Set((rows ?? []).map((r) => r.vendor_id).filter(Boolean))] as number[];
  const requestIds = (rows ?? []).map((r) => r.id);

  const [{ data: props }, { data: units }, { data: tenants }, { data: vendors }, notesMap] =
    await Promise.all([
      propIds.length
        ? supabase.from("Properties").select("id, property_name, color").in("id", propIds)
        : Promise.resolve({ data: [] as { id: number; property_name: string | null; color: string }[] }),
      unitIds.length
        ? supabase.from("Units").select("id, unit_label").in("id", unitIds)
        : Promise.resolve({ data: [] as { id: number; unit_label: string }[] }),
      tenantIds.length
        ? supabase.from("Tenants").select("id, first_name, last_name").in("id", tenantIds)
        : Promise.resolve({ data: [] as { id: number; first_name: string; last_name: string }[] }),
      vendorIds.length
        ? supabase.from("Vendors").select("id, name, color").in("id", vendorIds)
        : Promise.resolve({ data: [] as { id: number; name: string; color: string }[] }),
      loadStaffNotesByRequestIds(requestIds),
    ]);

  const propMap = new Map((props ?? []).map((p) => [p.id, p]));
  const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
  const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));
  const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v]));

  return (rows ?? []).map((r) => {
    const p = r.property_id ? propMap.get(r.property_id) : undefined;
    const u = r.unit_id ? unitMap.get(r.unit_id) : undefined;
    const t = r.submitted_by_tenant_id ? tenantMap.get(r.submitted_by_tenant_id) : undefined;
    const v = r.vendor_id ? vendorMap.get(r.vendor_id) : undefined;
    return mapWorkOrder(r, {
      property_name: p?.property_name,
      property_color: p?.color,
      unit_name: u?.unit_label,
      tenant_first_name: t?.first_name,
      tenant_last_name: t?.last_name,
      vendor_name: v?.name,
      vendor_color: v?.color,
      notes: notesMap.get(r.id) ?? null,
    });
  });
}

export async function createWorkOrder(input: NewWorkOrder): Promise<WorkOrder> {
  // New WOs start Open — companion-heavy statuses go through update / Accept & schedule.
  const { data, error } = await supabase
    .from("MaintenanceRequests")
    .insert({
      title: input.title,
      description: input.description?.trim() || input.title,
      category: maintenanceCategoryToDb((input.category as string) || "General repair"),
      priority: workOrderPriorityToDb(input.priority ?? "normal"),
      status: "Open",
      property_id: input.property_id ?? null,
      unit_id: input.unit_id ?? null,
      vendor_id: input.vendor_id ?? null,
      submitted_by_tenant_id: input.tenant_id ?? null,
      assigned_staff_id: null,
      scheduled_for: null,
      cost: input.cost ?? null,
      permission_to_enter: input.permission_to_enter ?? false,
      resolution_notes: null,
      hold_reason: null,
      next_follow_up_date: null,
      started_at: null,
      closed_at: null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  const initialNotes = input.notes?.trim() || null;
  if (initialNotes) {
    await upsertStaffNotes(data!.id, initialNotes);
  }
  const list = await listWorkOrders();
  return list.find((w) => w.id === data!.id) ?? mapWorkOrder(data!, { notes: initialNotes });
}

/** Tenant self-submit: RLS requires Open, own tenant_id, own unit_id, no schedule/assignment. */
export async function submitTenantMaintenanceRequest(input: {
  title: string;
  description: string;
  category: MaintenanceCategory | string;
  permission_to_enter: boolean;
  priority?: WorkOrderPriority;
}): Promise<WorkOrder> {
  const { data: role, error: roleErr } = await supabase
    .from("user_roles")
    .select("tenant_id, role, account_status")
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (roleErr) throwSb(roleErr);
  if (!role || role.role !== "tenant" || role.account_status !== "approved" || role.tenant_id == null) {
    throw new Error("Only approved tenants can submit maintenance requests.");
  }

  const { data: tenant, error: tenantErr } = await supabase
    .from("Tenants")
    .select("id, unit_id")
    .eq("id", role.tenant_id)
    .single();
  if (tenantErr) throwSb(tenantErr);
  if (!tenant.unit_id) {
    throw new Error("Your tenant profile has no unit assigned. Ask staff to link a unit before submitting.");
  }

  const { data: unit, error: unitErr } = await supabase
    .from("Units")
    .select("id, property_id")
    .eq("id", tenant.unit_id)
    .single();
  if (unitErr) throwSb(unitErr);

  const { data, error } = await supabase
    .from("MaintenanceRequests")
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      category: maintenanceCategoryToDb(input.category),
      priority: workOrderPriorityToDb(input.priority ?? "normal"),
      status: "Open",
      property_id: unit.property_id,
      unit_id: tenant.unit_id,
      submitted_by_tenant_id: role.tenant_id,
      permission_to_enter: input.permission_to_enter,
      assigned_staff_id: null,
      scheduled_for: null,
      started_at: null,
      closed_at: null,
      hold_reason: null,
      next_follow_up_date: null,
      resolution_notes: null,
      is_test_data: false,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapWorkOrder(data!);
}

export async function updateWorkOrder(
  id: number,
  patch: Partial<NewWorkOrder>,
  opts?: { previousStatus?: WorkOrderStatus },
): Promise<WorkOrder> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) {
    const next = patch.description?.trim();
    // Never coerce empty description to title — protect_maintenance_request blocks non-admin description changes.
    if (next) row.description = next;
  }
  if (patch.category !== undefined) row.category = maintenanceCategoryToDb(patch.category);
  if (patch.permission_to_enter !== undefined) row.permission_to_enter = patch.permission_to_enter;
  if (patch.priority !== undefined) row.priority = workOrderPriorityToDb(patch.priority);
  if (patch.status !== undefined) {
    row.status = workOrderStatusToDb(patch.status);
    const prev = opts?.previousStatus;
    if (patch.status === "in_progress" && prev !== "in_progress") {
      row.started_at = new Date().toISOString();
    }
    // Companion CHECK: Closed needs closed_at; any other status needs closed_at null
    if (patch.status === "closed") {
      if (prev !== "closed") row.closed_at = new Date().toISOString();
    } else {
      row.closed_at = null;
    }
  }
  if (patch.property_id !== undefined) row.property_id = patch.property_id;
  if (patch.unit_id !== undefined) row.unit_id = patch.unit_id;
  if (patch.vendor_id !== undefined) row.vendor_id = patch.vendor_id;
  if (patch.tenant_id !== undefined) row.submitted_by_tenant_id = patch.tenant_id;
  if (patch.assigned_staff_id !== undefined) row.assigned_staff_id = patch.assigned_staff_id;
  if (patch.scheduled_at !== undefined) {
    row.scheduled_for = patch.scheduled_at
      ? patch.scheduled_at.length === 10
        ? `${patch.scheduled_at}T12:00:00.000Z`
        : patch.scheduled_at
      : null;
  }
  if (patch.cost !== undefined) row.cost = patch.cost;
  if (patch.resolution_notes !== undefined) row.resolution_notes = patch.resolution_notes;
  if (patch.hold_reason !== undefined) row.hold_reason = patch.hold_reason;
  if (patch.next_follow_up_date !== undefined) row.next_follow_up_date = patch.next_follow_up_date;

  // Notes live in MaintenanceRequestStaffNotes — skip empty MR patch (notes-only saves).
  if (Object.keys(row).length > 0) {
    const { error } = await supabase
      .from("MaintenanceRequests")
      .update(row as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throwSb(error);
  }
  if (patch.notes !== undefined) {
    await upsertStaffNotes(id, patch.notes);
  }
  const list = await listWorkOrders();
  const found = list.find((w) => w.id === id);
  if (found) return found;
  const { data: fallback, error: fbErr } = await supabase
    .from("MaintenanceRequests")
    .select("*")
    .eq("id", id)
    .single();
  if (fbErr) throwSb(fbErr);
  const notesMap = await loadStaffNotesByRequestIds([id]);
  return mapWorkOrder(fallback!, { notes: notesMap.get(id) ?? null });
}

/** Unit + property label for the signed-in tenant (submit context). */
export async function getTenantHomeContext(): Promise<TenantHomeContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: role, error: roleErr } = await supabase
    .from("user_roles")
    .select("tenant_id, role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleErr) throwSb(roleErr);
  if (!role || role.role !== "tenant" || role.account_status !== "approved" || role.tenant_id == null) {
    return null;
  }

  const { data: tenant, error: tenantErr } = await supabase
    .from("Tenants")
    .select("id, unit_id")
    .eq("id", role.tenant_id)
    .single();
  if (tenantErr) throwSb(tenantErr);

  if (!tenant.unit_id) {
    return {
      tenant_id: tenant.id,
      unit_id: null,
      unit_label: null,
      property_id: null,
      property_name: null,
    };
  }

  const { data: unit, error: unitErr } = await supabase
    .from("Units")
    .select("id, unit_label, property_id")
    .eq("id", tenant.unit_id)
    .single();
  if (unitErr) throwSb(unitErr);

  let propertyName: string | null = null;
  if (unit.property_id != null) {
    const { data: prop } = await supabase
      .from("Properties")
      .select("id, property_name")
      .eq("id", unit.property_id)
      .maybeSingle();
    propertyName = prop?.property_name ?? null;
  }

  return {
    tenant_id: tenant.id,
    unit_id: unit.id,
    unit_label: unit.unit_label,
    property_id: unit.property_id,
    property_name: propertyName,
  };
}

export async function deleteWorkOrder(id: number): Promise<void> {
  const { error } = await supabase.from("MaintenanceRequests").delete().eq("id", id);
  if (error) throwSb(error);
}

const PHOTO_BUCKET = "maintenance-photos";

export async function listMaintenancePhotos(requestId: number): Promise<MaintenancePhoto[]> {
  const { data, error } = await supabase
    .from("MaintenanceRequestPhotos")
    .select("*")
    .eq("maintenance_request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throwSb(error);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Prefer one batch sign; fall back per path if a batch entry is missing
  // (older Storage hosts / incomplete responses).
  const paths = rows.map((row) => row.storage_path);
  const { data: signedList } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 3600);
  const urlByPath = new Map<string, string>();
  for (const entry of signedList ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }
  await Promise.all(
    rows.map(async (row) => {
      if (urlByPath.has(row.storage_path)) return;
      const { data: signed } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(row.storage_path, 3600);
      if (signed?.signedUrl) urlByPath.set(row.storage_path, signed.signedUrl);
    }),
  );

  return rows.map((row) => ({
    id: row.id,
    maintenance_request_id: row.maintenance_request_id,
    storage_path: row.storage_path,
    caption: row.caption,
    created_at: row.created_at,
    uploaded_by_role: row.uploaded_by_role,
    url: urlByPath.get(row.storage_path) ?? null,
  }));
}

export async function uploadMaintenancePhoto(
  requestId: number,
  file: File,
  caption?: string,
): Promise<MaintenancePhoto> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const rawExt = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const ext = (rawExt ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${requestId}/${crypto.randomUUID()}.${ext}`;

  // Insert metadata first so storage path-bind (EXISTS on storage_path) allows upload;
  // roll back the row if storage fails (mirrors uploadPropertyDocument).
  const { data, error } = await supabase
    .from("MaintenanceRequestPhotos")
    .insert({
      maintenance_request_id: requestId,
      storage_path: path,
      caption: caption?.trim() || null,
      uploaded_by_user_id: user.id,
      uploaded_by_role: roleRow?.role ?? null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);

  const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) {
    const { error: delErr } = await supabase.from("MaintenanceRequestPhotos").delete().eq("id", data!.id);
    if (delErr) {
      throw new Error(`${upErr.message} (also failed to roll back photo row: ${delErr.message})`);
    }
    throw new Error(upErr.message);
  }

  const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return {
    id: data!.id,
    maintenance_request_id: data!.maintenance_request_id,
    storage_path: data!.storage_path,
    caption: data!.caption,
    created_at: data!.created_at,
    uploaded_by_role: data!.uploaded_by_role,
    url: signed?.signedUrl ?? null,
  };
}

export async function listMaintenanceComments(requestId: number): Promise<MaintenanceComment[]> {
  const { data, error } = await supabase
    .from("MaintenanceRequestComments")
    .select("*")
    .eq("maintenance_request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throwSb(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    maintenance_request_id: row.maintenance_request_id,
    body: row.body,
    visibility: (row.visibility as CommentVisibility) || "tenant_visible",
    author_role: row.author_role,
    author_staff_id: row.author_staff_id,
    author_tenant_id: row.author_tenant_id,
    created_at: row.created_at,
  }));
}

export async function addMaintenanceComment(
  requestId: number,
  body: string,
  visibility: CommentVisibility = "tenant_visible",
): Promise<MaintenanceComment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: roleRow, error: roleErr } = await supabase
    .from("user_roles")
    .select("role, staff_id, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleErr) throwSb(roleErr);

  const { data, error } = await supabase
    .from("MaintenanceRequestComments")
    .insert({
      maintenance_request_id: requestId,
      body: body.trim(),
      visibility,
      author_user_id: user.id,
      author_role: roleRow?.role ?? null,
      author_staff_id: roleRow?.staff_id ?? null,
      author_tenant_id: roleRow?.tenant_id ?? null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  return {
    id: data!.id,
    maintenance_request_id: data!.maintenance_request_id,
    body: data!.body,
    visibility: (data!.visibility as CommentVisibility) || "tenant_visible",
    author_role: data!.author_role,
    author_staff_id: data!.author_staff_id,
    author_tenant_id: data!.author_tenant_id,
    created_at: data!.created_at,
  };
}

export async function listMaintenanceStatusHistory(
  requestId: number,
): Promise<MaintenanceStatusEvent[]> {
  const { data, error } = await supabase
    .from("MaintenanceRequestStatusHistory")
    .select("*")
    .eq("maintenance_request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throwSb(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    maintenance_request_id: row.maintenance_request_id,
    from_status: row.from_status,
    to_status: row.to_status,
    changed_by_role: row.changed_by_role,
    note: row.note,
    created_at: row.created_at,
  }));
}

// ── Dashboard ─────────────────────────────────────────────────────

type DashboardChargeRow = {
  amount: number | string;
  amount_paid: number | string;
  status: string;
  due_date: string;
};

type DashboardLeaseRow = {
  id: number;
  status: string;
  end_date: string;
  unit_id: number;
  primary_tenant_id: number | null;
};

type DashboardWoRow = {
  id: number;
  title: string;
  priority: string;
  status: string;
  property_id: number | null;
  unit_id: number | null;
  created_at: string;
};

function chargeBalance(c: DashboardChargeRow): number {
  return Number(c.amount) - Number(c.amount_paid);
}

async function loadDashboardAggregateRows(period: string): Promise<{
  propertyCount: number;
  units: { id: number; status: string }[];
  activeLeases: DashboardLeaseRow[];
  charges: DashboardChargeRow[];
  workOrders: DashboardWoRow[];
}> {
  // Slim aggregates — avoid full listProperties/listUnits/listLeases/listCharges/listWorkOrders graphs.
  // Page open WOs + period charges past PostgREST max-rows so money/WO KPIs stay accurate.
  const [propertyRows, units, activeLeases, charges, workOrders] = await Promise.all([
    selectAllPages<{ id: number }>((from, to) =>
      supabase.from("Properties").select("id").range(from, to),
    ),
    selectAllPages<{ id: number; status: string }>((from, to) =>
      supabase.from("Units").select("id, status").range(from, to),
    ),
    selectAllPages<DashboardLeaseRow>((from, to) =>
      supabase
        .from("Leases")
        .select("id, status, end_date, unit_id, primary_tenant_id")
        .eq("status", "active")
        .range(from, to),
    ),
    selectAllPages<DashboardChargeRow>((from, to) =>
      supabase
        .from("RentCharges")
        .select("amount, amount_paid, status, due_date")
        .eq("period", period)
        .range(from, to),
    ),
    selectAllPages<DashboardWoRow>((from, to) =>
      supabase
        .from("MaintenanceRequests")
        .select("id, title, priority, status, property_id, unit_id, created_at")
        .in("status", [...WORK_ORDER_OPEN_STATUSES_DB])
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  return {
    propertyCount: propertyRows.length,
    units,
    activeLeases,
    charges,
    workOrders,
  };
}

async function enrichDashboardSlices(
  recentTop: DashboardWoRow[],
  upcomingTop: DashboardLeaseRow[],
): Promise<{
  unitMap: Map<number, { id: number; unit_label: string; property_id: number }>;
  propMap: Map<number, { id: number; property_name: string | null }>;
  tenantMap: Map<number, { id: number; first_name: string; last_name: string }>;
}> {
  const unitIds = [
    ...new Set(
      [...recentTop.map((w) => w.unit_id), ...upcomingTop.map((l) => l.unit_id)].filter(
        (id): id is number => id != null,
      ),
    ),
  ];
  const tenantIds = [
    ...new Set(upcomingTop.map((l) => l.primary_tenant_id).filter((id): id is number => id != null)),
  ];
  const knownPropIds = [
    ...new Set(recentTop.map((w) => w.property_id).filter((id): id is number => id != null)),
  ];

  // Units + tenants + WO property ids in parallel; fill any unit-only property ids after.
  const [
    { data: sliceUnits, error: unitErr },
    { data: tenants, error: tenantErr },
    { data: knownProps, error: knownPropErr },
  ] = await Promise.all([
    unitIds.length
      ? supabase.from("Units").select("id, unit_label, property_id").in("id", unitIds)
      : Promise.resolve({
          data: [] as { id: number; unit_label: string; property_id: number }[],
          error: null,
        }),
    tenantIds.length
      ? supabase.from("Tenants").select("id, first_name, last_name").in("id", tenantIds)
      : Promise.resolve({
          data: [] as { id: number; first_name: string; last_name: string }[],
          error: null,
        }),
    knownPropIds.length
      ? supabase.from("Properties").select("id, property_name").in("id", knownPropIds)
      : Promise.resolve({
          data: [] as { id: number; property_name: string | null }[],
          error: null,
        }),
  ]);
  if (unitErr) throwSb(unitErr);
  if (tenantErr) throwSb(tenantErr);
  if (knownPropErr) throwSb(knownPropErr);

  const unitMap = new Map((sliceUnits ?? []).map((u) => [u.id, u]));
  const propMap = new Map((knownProps ?? []).map((p) => [p.id, p]));
  const missingPropIds = [
    ...new Set(
      (sliceUnits ?? [])
        .map((u) => u.property_id)
        .filter((id) => !propMap.has(id)),
    ),
  ];
  if (missingPropIds.length) {
    const { data: moreProps, error: propErr } = await supabase
      .from("Properties")
      .select("id, property_name")
      .in("id", missingPropIds);
    if (propErr) throwSb(propErr);
    for (const p of moreProps ?? []) propMap.set(p.id, p);
  }

  return {
    unitMap,
    propMap,
    tenantMap: new Map((tenants ?? []).map((t) => [t.id, t])),
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  const in30Iso = in30.toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);

  const { propertyCount, units, activeLeases, charges, workOrders } =
    await loadDashboardAggregateRows(period);

  const occupied = units.filter((u) => lower(u.status) === "occupied").length;
  const vacant = units.filter((u) => lower(u.status) === "vacant").length;
  // Sort by end_date (soonest first) — intentional vs old listLeases start_date order for top-5 membership.
  const upcoming = activeLeases
    .filter((l) => l.end_date <= in30Iso && l.end_date >= todayIso)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
  const upcomingTop = upcoming.slice(0, 5);

  const month_outstanding = charges
    .filter((c) => c.status !== "paid" && c.status !== "waived")
    .reduce((s, c) => s + chargeBalance(c), 0);
  const month_collected = charges.reduce((s, c) => s + Number(c.amount_paid), 0);
  const overdue = charges.filter(
    (c) =>
      c.status === "overdue" ||
      (c.due_date < todayIso && c.status !== "paid" && c.status !== "waived"),
  );

  // Query already filters open statuses; normalize via shared mappers for display + urgent count.
  const openWo = workOrders.filter((w) => workOrderStatusFromDb(w.status) !== "closed");
  const urgentWo = openWo.filter((w) => workOrderPriorityFromDb(w.priority) === "urgent");
  const recentTop = openWo.slice(0, 5);

  const { unitMap, propMap, tenantMap } = await enrichDashboardSlices(recentTop, upcomingTop);

  return {
    period,
    properties: propertyCount,
    units: units.length,
    occupied,
    vacant,
    occupancy_rate: units.length ? Math.round((occupied / units.length) * 100) : 0,
    active_leases: activeLeases.length,
    upcoming_move_outs: upcoming.length,
    month_outstanding,
    month_collected,
    overdue_total: overdue.reduce((s, c) => s + chargeBalance(c), 0),
    overdue_count: overdue.length,
    open_work_orders: openWo.length,
    urgent_work_orders: urgentWo.length,
    recent_work_orders: recentTop.map((w) => {
      const u = w.unit_id != null ? unitMap.get(w.unit_id) : undefined;
      const propId = w.property_id ?? u?.property_id;
      const p = propId != null ? propMap.get(propId) : undefined;
      return {
        id: w.id,
        title: w.title,
        priority: workOrderPriorityFromDb(w.priority),
        status: workOrderStatusFromDb(w.status),
        property_name: p?.property_name ?? null,
        unit_name: u?.unit_label ?? null,
        created_at: w.created_at,
      };
    }),
    upcoming_expirations: upcomingTop.map((l) => {
      const u = unitMap.get(l.unit_id);
      const p = u ? propMap.get(u.property_id) : undefined;
      const t = l.primary_tenant_id ? tenantMap.get(l.primary_tenant_id) : undefined;
      return {
        id: l.id,
        end_date: l.end_date,
        tenant_first_name: t?.first_name ?? null,
        tenant_last_name: t?.last_name ?? null,
        unit_name: u?.unit_label ?? null,
        property_name: p?.property_name ?? null,
      };
    }),
  };
}

void assertOk;

// ── Staff (admin role linking) ────────────────────────────────────

export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from("Staff")
    .select("id, first_name, last_name, email, job_title")
    .order("last_name");
  if (error) throwSb(error);
  return (data ?? []).map((s) => ({
    id: s.id,
    first_name: s.first_name,
    last_name: s.last_name,
    email: s.email,
    job_title: s.job_title,
  }));
}

// ── User accounts (admin approval queue) ──────────────────────────

export async function listUserAccounts(): Promise<UserAccountRow[]> {
  const { data, error } = await supabase.rpc("list_user_accounts_for_admin");
  if (error) throwSb(error);
  return (data ?? []).map((row) => {
    const mapped: UserAccountRow = {
      user_id: row.user_id,
      email: row.email,
      role: row.role,
      landlord_id: row.landlord_id,
      tenant_id: row.tenant_id,
      staff_id: row.staff_id,
      account_status: (row.account_status || "pending") as AccountStatus,
      created_at: row.created_at,
    };
    // Preserve absence when live RPC predates the column (do not coerce to null).
    if ("email_confirmed_at" in row) {
      mapped.email_confirmed_at = row.email_confirmed_at ?? null;
    }
    return mapped;
  });
}

export async function setAccountStatus(
  userId: string,
  status: AccountStatus,
): Promise<Tables<"user_roles">> {
  const { data, error } = await supabase.rpc("set_account_status", {
    p_user_id: userId,
    p_status: status,
  });
  if (error) throwSb(error);
  return data!;
}

export async function adminSetUserRole(
  userId: string,
  role: AppRole,
  links?: { landlord_id?: number | null; tenant_id?: number | null; staff_id?: number | null },
): Promise<Tables<"user_roles">> {
  const { data, error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: userId,
    p_role: role,
    p_landlord_id: links?.landlord_id ?? null,
    p_tenant_id: links?.tenant_id ?? null,
    p_staff_id: links?.staff_id ?? null,
  });
  if (error) throwSb(error);
  return data!;
}

// ── Applications (rental applicants — not account approval) ───────

export async function listApplications(status?: ApplicationStatus | "all"): Promise<Application[]> {
  let q = supabase.from("Applications").select("*").order("created_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data: rows, error } = await q;
  if (error) throwSb(error);

  const unitIds = [...new Set((rows ?? []).map((r) => r.unit_id).filter(Boolean))] as number[];
  const { data: units } = unitIds.length
    ? await supabase.from("Units").select("id, unit_label, property_id").in("id", unitIds)
    : { data: [] as { id: number; unit_label: string; property_id: number }[] };
  const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
  const propIds = [...new Set((units ?? []).map((u) => u.property_id))];
  const { data: props } = propIds.length
    ? await supabase.from("Properties").select("id, property_name").in("id", propIds)
    : { data: [] as { id: number; property_name: string | null }[] };
  const propMap = new Map((props ?? []).map((p) => [p.id, p]));

  return (rows ?? []).map((row) => {
    const unit = row.unit_id != null ? unitMap.get(row.unit_id) : undefined;
    const prop = unit ? propMap.get(unit.property_id) : undefined;
    return mapApplication(row, {
      unit_name: unit?.unit_label ?? null,
      property_name: prop?.property_name ?? null,
    });
  });
}

export async function createApplication(input: NewApplication): Promise<Application> {
  const { data, error } = await supabase
    .from("Applications")
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      unit_id: input.unit_id ?? null,
      monthly_income: input.monthly_income ?? null,
      employer: input.employer ?? null,
      desired_move_in: input.desired_move_in ?? null,
      status: input.status ?? "new",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapApplication(data!);
}

export async function updateApplication(
  id: number,
  patch: Partial<NewApplication>,
): Promise<Application> {
  const row: Record<string, unknown> = {};
  if (patch.first_name !== undefined) row.first_name = patch.first_name;
  if (patch.last_name !== undefined) row.last_name = patch.last_name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.unit_id !== undefined) row.unit_id = patch.unit_id;
  if (patch.monthly_income !== undefined) row.monthly_income = patch.monthly_income;
  if (patch.employer !== undefined) row.employer = patch.employer;
  if (patch.desired_move_in !== undefined) row.desired_move_in = patch.desired_move_in;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { data, error } = await supabase
    .from("Applications")
    .update(row as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapApplication(data!);
}

export async function deleteApplication(id: number): Promise<void> {
  const { error } = await supabase.from("Applications").delete().eq("id", id);
  if (error) throwSb(error);
}

// ── Property documents ────────────────────────────────────────────

const DOC_BUCKET = "property-documents";
const DOC_LIST_LIMIT = 200;
const DOC_SIGNED_URL_TTL_SEC = 120;

/** Mirrors storage.buckets.allowed_mime_types for property-documents (20261114100000). */
export const PROPERTY_DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const PROPERTY_DOCUMENT_ACCEPT = PROPERTY_DOCUMENT_ALLOWED_MIME_TYPES.join(",");

function mapPropertyDocument(
  row: Tables<"PropertyDocuments">,
  extras?: { unit_name?: string | null; property_name?: string | null },
): PropertyDocument {
  return {
    id: row.id,
    property_id: row.property_id,
    unit_id: row.unit_id,
    title: row.title,
    file_name: row.file_name,
    content_type: row.content_type,
    byte_size: row.byte_size,
    storage_path: row.storage_path,
    visibility: (row.visibility as DocumentVisibility) || "staff",
    uploaded_by_role: row.uploaded_by_role,
    notes: row.notes,
    created_at: row.created_at,
    unit_name: extras?.unit_name ?? null,
    property_name: extras?.property_name ?? null,
  };
}

export async function listPropertyDocuments(params?: {
  property_id?: number;
}): Promise<PropertyDocument[]> {
  let q = supabase
    .from("PropertyDocuments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(DOC_LIST_LIMIT);
  if (params?.property_id != null) q = q.eq("property_id", params.property_id);
  const { data, error } = await q;
  if (error) throwSb(error);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const unitIds = [...new Set(rows.map((r) => r.unit_id).filter((id): id is number => id != null))];
  const propertyIds = [...new Set(rows.map((r) => r.property_id))];

  const [{ data: units }, { data: props }] = await Promise.all([
    unitIds.length
      ? supabase.from("Units").select("id, unit_label").in("id", unitIds)
      : Promise.resolve({ data: [] as { id: number; unit_label: string }[] }),
    supabase.from("Properties").select("id, property_name").in("id", propertyIds),
  ]);

  const unitMap = new Map((units ?? []).map((u) => [u.id, u.unit_label]));
  const propMap = new Map((props ?? []).map((p) => [p.id, p.property_name]));

  return rows.map((row) =>
    mapPropertyDocument(row, {
      unit_name: row.unit_id != null ? unitMap.get(row.unit_id) ?? null : null,
      property_name: propMap.get(row.property_id) ?? null,
    }),
  );
}

/** Mint a short-lived signed URL on download click (not on list). Forces attachment disposition. */
export async function getPropertyDocumentDownloadUrl(doc: {
  storage_path: string;
  file_name?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(doc.storage_path, DOC_SIGNED_URL_TTL_SEC, {
      download: doc.file_name?.trim() || true,
    });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not create download link.");
  }
  return data.signedUrl;
}

export async function uploadPropertyDocument(input: {
  property_id: number;
  unit_id?: number | null;
  title: string;
  file: File;
  visibility: DocumentVisibility;
  notes?: string | null;
}): Promise<PropertyDocument> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const mime = (input.file.type || "").toLowerCase();
  if (
    !mime ||
    !(PROPERTY_DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
  ) {
    throw new Error(
      `File type not allowed${mime ? ` (${mime})` : ""}. Allowed: PDF, images, Word, Excel, plain text.`,
    );
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const rawExt = input.file.name.includes(".") ? input.file.name.split(".").pop() : "bin";
  const ext = (rawExt ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${input.property_id}/${crypto.randomUUID()}.${ext}`;

  // Insert metadata first so storage DELETE (path-bound) can roll back if upload fails.
  const { data, error } = await supabase
    .from("PropertyDocuments")
    .insert({
      property_id: input.property_id,
      unit_id: input.unit_id ?? null,
      title: input.title.trim(),
      file_name: input.file.name,
      content_type: input.file.type || null,
      byte_size: input.file.size,
      storage_path: path,
      visibility: input.visibility,
      uploaded_by_user_id: user.id,
      uploaded_by_role: roleRow?.role ?? null,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throwSb(error);

  const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, input.file, {
    cacheControl: "3600",
    upsert: false,
    contentType: input.file.type || undefined,
  });
  if (upErr) {
    const { error: delErr } = await supabase.from("PropertyDocuments").delete().eq("id", data!.id);
    if (delErr) {
      throw new Error(`${upErr.message} (also failed to roll back document row: ${delErr.message})`);
    }
    throw new Error(upErr.message);
  }

  return mapPropertyDocument(data!);
}

export async function updatePropertyDocumentVisibility(
  id: number,
  visibility: DocumentVisibility,
): Promise<PropertyDocument> {
  const { data, error } = await supabase
    .from("PropertyDocuments")
    .update({ visibility })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throwSb(error);
  return mapPropertyDocument(data!);
}

type StorageObjectPresence = "present" | "absent" | "unknown";

function isStorageObjectNotFoundError(error: {
  message?: string;
  statusCode?: string | number;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = String(error.statusCode ?? error.status ?? "").toLowerCase();
  // Live Storage often uses 404; the local emulator signs missing objects as 400 not_found.
  if (code === "404") return true;
  return /not[_ ]?found|object not found|does not exist/.test(msg);
}

/**
 * Probe whether a property-document storage object is still visible to the caller.
 * Ambiguous sign failures must not be treated as absent (avoids orphaning the file
 * by deleting metadata after a transient remove+sign outage).
 */
async function propertyDocumentStoragePresence(storagePath: string): Promise<StorageObjectPresence> {
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(storagePath, DOC_SIGNED_URL_TTL_SEC);
  if (data?.signedUrl && error == null) return "present";
  if (isStorageObjectNotFoundError(error)) return "absent";
  return "unknown";
}

export async function deletePropertyDocument(id: number): Promise<void> {
  const { data: doc, error } = await supabase
    .from("PropertyDocuments")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throwSb(error);
  if (!doc) throw new Error("Document not found.");

  // Bucket RLS SELECT joins PropertyDocuments by storage_path — remove the object
  // while the row still exists, then delete metadata (same storage-then-DB order
  // as deleteProperty, but required for SELECT RLS rather than CASCADE).
  const { data: removed, error: rmErr } = await supabase.storage
    .from(DOC_BUCKET)
    .remove([doc.storage_path]);
  const confirmedRemoved = rmErr == null && (removed?.length ?? 0) > 0;
  if (!confirmedRemoved) {
    // Retry-safe: a prior attempt may have removed storage then failed on DB delete.
    // Only continue when absence is clear. Present → RLS/permission no-op; unknown →
    // do not delete metadata (could orphan a still-existing object).
    const presence = await propertyDocumentStoragePresence(doc.storage_path);
    if (presence === "present") {
      throw new Error(rmErr?.message || "Failed to remove document from storage.");
    }
    if (presence === "unknown") {
      throw new Error(
        rmErr?.message ||
          "Could not confirm document was removed from storage; metadata left unchanged.",
      );
    }
  }

  const { data: deleted, error: delErr } = await supabase
    .from("PropertyDocuments")
    .delete()
    .eq("id", id)
    .select("id");
  if (delErr) {
    throw new Error(
      `${delErr.message} (storage object already removed; metadata row may remain)`,
    );
  }
  if (!deleted?.length) {
    throw new Error("Storage object removed but document metadata could not be deleted.");
  }
}
