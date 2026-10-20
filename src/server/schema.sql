-- ── Settings (key/value) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Defaults live in the app (DEFAULT_SETTINGS in src/server/index.ts): a
-- deploy applies DDL only, so a seed row here fails the whole build.

-- ── Users (Authentication & Multi-tenancy) ─────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'landlord',        -- 'landlord' | 'caretaker' | 'admin'
  plan TEXT NOT NULL DEFAULT 'free',            -- 'free' | 'starter' | 'plus' | 'manager'
  plan_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',        -- 'active' | 'cancelled' | 'suspended'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Sessions (Auth Tokens) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Properties (buildings) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_tenants_user ON tenants(user_id);

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
  amount_credited REAL NOT NULL DEFAULT 0,
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
  applied_amount REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'mpesa',        -- 'mpesa' | 'bank_transfer' | 'cash' | 'check' | 'credit' | 'other'
  reference TEXT,                              -- check number, transaction ID, etc.
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(charge_id);

-- Rent credits preserve overpayments as tenant funds until applied to a later charge.
CREATE TABLE IF NOT EXISTS rent_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  source_payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rent_credits_lease ON rent_credits(lease_id);

CREATE TABLE IF NOT EXISTS rent_credit_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_id INTEGER NOT NULL REFERENCES rent_credits(id) ON DELETE CASCADE,
  charge_id INTEGER NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(credit_id, charge_id)
);

CREATE INDEX IF NOT EXISTS idx_rent_credit_apps_charge ON rent_credit_applications(charge_id);

-- ── Vendors ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',    -- 'plumber' | 'electrician' | 'hvac' | 'handyman' | 'cleaning' | 'landscaping' | 'general'
  phone TEXT,
  email TEXT,
  notes TEXT,
  color TEXT NOT NULL DEFAULT 'slate',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vendors_user ON vendors(user_id);

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
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- ── Demo Requests (Lead Generation) ──────────────────────────────
CREATE TABLE IF NOT EXISTS demo_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 5,
  portfolio_type TEXT DEFAULT 'residential',
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status);

-- ── M-Pesa Transactions (Daraja STK Push & Callbacks) ─────────────
CREATE TABLE IF NOT EXISTS mpesa_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkout_request_id TEXT NOT NULL UNIQUE,
  merchant_request_id TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  amount REAL NOT NULL,
  purpose TEXT NOT NULL,                       -- 'subscription' | 'rent'
  reference_id TEXT,                           -- plan name (e.g. 'plus') or charge_id
  status TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'completed' | 'failed'
  mpesa_receipt TEXT,
  result_desc TEXT,
  metadata TEXT,                               -- JSON with extra details
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mpesa_checkout ON mpesa_transactions(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_user ON mpesa_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_status ON mpesa_transactions(status);

-- ── Feedback, Complaints & Feature Requests ────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',    -- 'suggestion' | 'complaint' | 'cancellation' | 'general'
  message TEXT NOT NULL,
  rating INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);

-- Demo data is seeded by the app on first read (ensureSeeded in
-- src/server/index.ts), never here: this file is applied as DDL only.
