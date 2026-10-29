// ── Core entities ──────────────────────────────────────────────────

export type PropertyType = "single_family" | "multi_family" | "condo" | "townhouse" | "commercial";

export interface Property {
  id: number;
  name: string;
  type: PropertyType;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  year_built: number | null;
  notes: string | null;
  color: string;
  created_at: string;
  // Joined
  unit_count?: number;
  occupied_count?: number;
}

export type UnitStatus = "vacant" | "occupied" | "turnover" | "unavailable";

export interface Unit {
  id: number;
  property_id: number;
  name: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  market_rent: number;
  status: UnitStatus;
  notes: string | null;
  created_at: string;
  // Joined
  property_name?: string | null;
  property_color?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  active_lease_id?: number | null;
  active_tenant_name?: string | null;
}

export interface Tenant {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  emergency_contact: string | null;
  employer: string | null;
  monthly_income: number | null;
  notes: string | null;
  created_at: string;
  // Joined (active lease)
  active_unit_id?: number | null;
  active_unit_name?: string | null;
  active_property_name?: string | null;
}

export type LeaseStatus = "upcoming" | "active" | "ended" | "cancelled";

export interface Lease {
  id: number;
  unit_id: number;
  primary_tenant_id: number | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  deposit: number;
  rent_due_day: number;
  late_fee: number;
  status: LeaseStatus;
  notes: string | null;
  created_at: string;
  // Joined
  unit_name?: string | null;
  property_id?: number | null;
  property_name?: string | null;
  property_color?: string | null;
  tenant_first_name?: string | null;
  tenant_last_name?: string | null;
  tenant_email?: string | null;
  tenant_phone?: string | null;
}

export type ChargeStatus = "open" | "partial" | "paid" | "overdue" | "waived";

export interface RentCharge {
  id: number;
  lease_id: number;
  period: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  status: ChargeStatus;
  notes: string | null;
  created_at: string;
  // Joined
  unit_id?: number | null;
  lease_rent?: number | null;
  rent_due_day?: number | null;
  unit_name?: string | null;
  property_id?: number | null;
  property_name?: string | null;
  property_color?: string | null;
  tenant_id?: number | null;
  tenant_first_name?: string | null;
  tenant_last_name?: string | null;
}

export type PaymentMethod = "cash" | "check" | "ach" | "credit" | "other";

export interface Payment {
  id: number;
  charge_id: number;
  paid_at: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
}

export type VendorCategory = "plumber" | "electrician" | "hvac" | "handyman" | "cleaning" | "landscaping" | "general";

export interface Vendor {
  id: number;
  name: string;
  category: VendorCategory;
  phone: string | null;
  email: string | null;
  notes: string | null;
  color: string;
  created_at: string;
}

export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";
export type WorkOrderStatus = "open" | "assigned" | "in_progress" | "completed" | "cancelled";

export interface WorkOrder {
  id: number;
  property_id: number | null;
  unit_id: number | null;
  tenant_id: number | null;
  vendor_id: number | null;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  // Joined
  property_name?: string | null;
  property_color?: string | null;
  unit_name?: string | null;
  tenant_first_name?: string | null;
  tenant_last_name?: string | null;
  vendor_name?: string | null;
  vendor_color?: string | null;
}

export type ApplicationStatus = "new" | "screening" | "approved" | "declined" | "withdrawn";

export interface Application {
  id: number;
  unit_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  monthly_income: number | null;
  employer: string | null;
  desired_move_in: string | null;
  status: ApplicationStatus;
  notes: string | null;
  created_at: string;
  unit_name?: string | null;
  property_name?: string | null;
}

export interface DashboardSummary {
  period: string;
  properties: number;
  units: number;
  occupied: number;
  vacant: number;
  occupancy_rate: number;
  active_leases: number;
  upcoming_move_outs: number;
  month_outstanding: number;
  month_collected: number;
  overdue_total: number;
  overdue_count: number;
  open_work_orders: number;
  urgent_work_orders: number;
  recent_work_orders: {
    id: number; title: string; priority: string; status: string;
    property_name: string | null; unit_name: string | null; created_at: string;
  }[];
  upcoming_expirations: {
    id: number; end_date: string;
    tenant_first_name: string | null; tenant_last_name: string | null;
    unit_name: string | null; property_name: string | null;
  }[];
}

// ── Input types for mutations ──────────────────────────────────────

export type NewProperty = Partial<Omit<Property, "id" | "created_at" | "unit_count" | "occupied_count">> & { name: string };
export type NewUnit = Partial<Omit<Unit, "id" | "created_at" | "property_name" | "property_color" | "property_address" | "property_city" | "active_lease_id" | "active_tenant_name">> & { property_id: number; name: string };
export type NewTenant = Partial<Omit<Tenant, "id" | "created_at" | "active_unit_id" | "active_unit_name" | "active_property_name">> & { first_name: string; last_name: string };
export type NewLease = Partial<Omit<Lease, "id" | "created_at" | "unit_name" | "property_id" | "property_name" | "property_color" | "tenant_first_name" | "tenant_last_name" | "tenant_email" | "tenant_phone">> & { unit_id: number; start_date: string; end_date: string };
export type NewWorkOrder = Partial<Omit<WorkOrder, "id" | "created_at" | "property_name" | "property_color" | "unit_name" | "tenant_first_name" | "tenant_last_name" | "vendor_name" | "vendor_color">> & { title: string };
export type NewVendor = Partial<Omit<Vendor, "id" | "created_at">> & { name: string };
export type NewApplication = Partial<Omit<Application, "id" | "created_at" | "unit_name" | "property_name">> & { first_name: string; last_name: string };

// ── Bank matching ──────────────────────────────────────────────────

export type BankEvidence =
  | "known_account" | "known_name" | "tenant_name" | "tenant_last_name" | "reference_unit" | "amount_exact" | "amount_only";

export interface LeaseLabel {
  lease_id: number;
  property_name: string | null;
  unit_name: string | null;
  tenant_name: string | null;
}

export interface BankTransaction {
  id: number;
  import_id: number | null;
  booked_on: string;
  amount: number;
  currency: string | null;
  payer_name: string | null;
  payer_account: string | null;
  reference: string | null;
  bank_ref: string | null;
  status: "review" | "matched" | "ignored";
  lease_id: number | null;
  matched_by: "auto" | "person" | "agent" | null;
  note: string | null;
  /** To review: the suggested match, worked out fresh on every read. */
  proposal?: {
    kind: "auto" | "suggested" | "none";
    lease: LeaseLabel | null;
    allocations: { charge_id: number; amount: number; period: string | null }[];
    unapplied: number;
    evidence: BankEvidence[];
    candidates: (LeaseLabel & { owing: number })[];
  };
  /** Matched: the lease and the payments it became. */
  lease?: LeaseLabel | null;
  payments?: { payment_id: number; amount: number; charge_id: number; period: string }[];
  unapplied?: number;
}

export interface BankLease extends LeaseLabel {
  open: { id: number; lease_id: number; period: string; due_date: string; balance: number }[];
  owing: number;
}

export interface ImportSummary {
  lines: number;
  money_out_skipped: number;
  duplicates: number;
  imported: number;
  auto_matched: number;
  to_review: number;
}

// ── Late-rent reminders ────────────────────────────────────────────

export interface DueReminderItem {
  charge_id: number;
  lease_id: number;
  period: string;
  due_date: string;
  amount: number;
  balance: number;
  days_late: number;
  step: { key: string; label: string };
  tenant: { id: number | null; name: string | null; email: string | null; phone: string | null };
  property_name: string | null;
  unit_name: string | null;
  draft: { to: string | null; subject: string; body: string };
  pending_payment: { transaction_id: number; amount: number; booked_on: string } | null;
}

export interface SentReminder {
  id: number;
  charge_id: number;
  step: string;
  status: "sent" | "skipped";
  channel: string;
  sent_by: "person" | "agent";
  recipient: string | null;
  subject: string | null;
  created_at: string;
  period: string;
  first_name: string | null;
  last_name: string | null;
  unit_name: string | null;
  property_name: string | null;
}
