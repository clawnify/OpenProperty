-- ── Settings (key/value) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Defaults live in the app (DEFAULT_SETTINGS in src/server/index.ts): a
-- deploy applies DDL only, so a seed row here fails the whole build.

-- ── Properties (buildings) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'single_family',  -- 'single_family' | 'multi_family' | 'condo' | 'townhouse' | 'commercial'
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  year_built INTEGER,
  notes TEXT,
  color TEXT NOT NULL DEFAULT 'sky',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Units (rentable spaces inside a property) ────────────────────
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- e.g. 'Unit 1A', '308', 'Main house'
  bedrooms REAL NOT NULL DEFAULT 1,            -- studio = 0, allows half-beds (rare)
  bathrooms REAL NOT NULL DEFAULT 1,           -- allows half-baths (1.5)
  sqft INTEGER,
  market_rent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'vacant',       -- 'vacant' | 'occupied' | 'turnover' | 'unavailable'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);

-- ── Tenants ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth TEXT,
  emergency_contact TEXT,
  employer TEXT,
  monthly_income REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(last_name, first_name);

-- ── Leases ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  primary_tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL,                    -- 'YYYY-MM-DD'
  end_date TEXT NOT NULL,
  monthly_rent REAL NOT NULL DEFAULT 0,
  deposit REAL NOT NULL DEFAULT 0,
  rent_due_day INTEGER NOT NULL DEFAULT 1,
  late_fee REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',       -- 'upcoming' | 'active' | 'ended' | 'cancelled'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(primary_tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);

-- Multi-tenant leases (occupants beyond the primary).
CREATE TABLE IF NOT EXISTS lease_tenants (
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (lease_id, tenant_id)
);

-- ── Rent charges (one per period per lease) ──────────────────────
CREATE TABLE IF NOT EXISTS rent_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                        -- 'YYYY-MM' (e.g. '2026-04')
  due_date TEXT NOT NULL,                      -- 'YYYY-MM-DD'
  amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',         -- 'open' | 'partial' | 'paid' | 'overdue' | 'waived'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_charges_lease_period ON rent_charges(lease_id, period);
CREATE INDEX IF NOT EXISTS idx_charges_due ON rent_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_charges_status ON rent_charges(status);

-- ── Payments (applied to a charge) ───────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  amount REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',         -- 'cash' | 'check' | 'ach' | 'credit' | 'other'
  reference TEXT,                              -- check number, transaction ID, etc.
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(charge_id);

-- ── Vendors ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',    -- 'plumber' | 'electrician' | 'hvac' | 'handyman' | 'cleaning' | 'landscaping' | 'general'
  phone TEXT,
  email TEXT,
  notes TEXT,
  color TEXT NOT NULL DEFAULT 'slate',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Work orders (maintenance) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,  -- who reported it
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',     -- 'low' | 'normal' | 'high' | 'urgent'
  status TEXT NOT NULL DEFAULT 'open',         -- 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_at TEXT,
  completed_at TEXT,
  cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_property ON work_orders(property_id);
CREATE INDEX IF NOT EXISTS idx_wo_unit ON work_orders(unit_id);

-- ── Applications (manual record only — no public submission) ─────
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  monthly_income REAL,
  employer TEXT,
  desired_move_in TEXT,
  status TEXT NOT NULL DEFAULT 'new',          -- 'new' | 'screening' | 'approved' | 'declined' | 'withdrawn'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- ── Bank statements (money in, matched to rent) ───────────────────
-- Only new tables here, never a changed one: an existing install picks them
-- up on its next deploy with no migration of the rent data it already has.

CREATE TABLE IF NOT EXISTS bank_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  format TEXT NOT NULL DEFAULT 'csv',          -- 'csv' | 'camt053' | 'api'
  credits INTEGER NOT NULL DEFAULT 0,          -- incoming payments in the file
  duplicates INTEGER NOT NULL DEFAULT 0,       -- already imported from an earlier statement
  auto_matched INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER REFERENCES bank_imports(id) ON DELETE SET NULL,
  booked_on TEXT NOT NULL,                     -- 'YYYY-MM-DD'
  amount REAL NOT NULL,                        -- money in, always > 0
  currency TEXT,
  payer_name TEXT,
  payer_account TEXT,                          -- IBAN or account number, no spaces
  reference TEXT,
  bank_ref TEXT,                               -- the bank's own id for the line, when it gives one
  fingerprint TEXT NOT NULL,                   -- the same line in two overlapping statements is one payment
  status TEXT NOT NULL DEFAULT 'review',       -- 'review' | 'matched' | 'ignored'
  lease_id INTEGER REFERENCES leases(id) ON DELETE SET NULL,  -- the lease it paid, once matched
  matched_by TEXT,                             -- 'auto' | 'person' | 'agent'
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_fingerprint ON bank_transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON bank_transactions(status, booked_on);

-- Who pays for a lease, learned when a person confirms a match: the IBAN when
-- the bank gives one, else the sender's name (stored normalised).
CREATE TABLE IF NOT EXISTS bank_payers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  payer_account TEXT,
  payer_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bank_payers_lease ON bank_payers(lease_id);

-- The payments a bank transaction became: one transfer can pay two months.
CREATE TABLE IF NOT EXISTS bank_matches (
  transaction_id INTEGER NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, payment_id)
);

-- ── Late-rent reminders ──────────────────────────────────────────
-- One row per charge and step, written when the reminder is sent (or skipped).
-- A person sends today; sent_by and channel leave room for an agent to.
CREATE TABLE IF NOT EXISTS rent_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
  step TEXT NOT NULL,                          -- 'before_due' | 'late' | 'final'
  status TEXT NOT NULL DEFAULT 'sent',         -- 'sent' | 'skipped'
  channel TEXT NOT NULL DEFAULT 'email',       -- 'email' | 'sms' | 'letter' | 'phone' | 'other'
  sent_by TEXT NOT NULL DEFAULT 'person',      -- 'person' | 'agent'
  recipient TEXT,
  subject TEXT,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_charge_step ON rent_reminders(charge_id, step);

-- Demo data is seeded by the app on first read (ensureSeeded in
-- src/server/index.ts), never here: this file is applied as DDL only.
