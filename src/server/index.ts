import { Hono, type Context } from "hono";
import { z } from "zod";
import { initDB, query, get, run } from "./db";
import { hashPassword, verifyPassword, createSession, getSessionUser, deleteSession, type User } from "./auth";
import { initiateStkPush, parseDarajaCallback, normalizeKenyanPhone, queryStkPush, DEFAULT_SANDBOX_CONFIG, type DarajaConfig, type StkPushResult } from "./mpesa";
import { getPlanLimits, isPaidPlan, PAID_PLANS, type PaidPlanId } from "../shared/plan-config";

type Variables = {
  user: User | null;
};

type Env = {
  Bindings: {
    DB: D1Database;
    ASSETS: Fetcher;
    DARAJA_ENVIRONMENT?: "sandbox" | "production";
    DARAJA_CONSUMER_KEY?: string;
    DARAJA_CONSUMER_SECRET?: string;
    DARAJA_BUSINESS_SHORTCODE?: string;
    DARAJA_PASSKEY?: string;
    DARAJA_CALLBACK_URL?: string;
    ALLOW_PAYMENT_SIMULATION?: string;
  };
  Variables: Variables;
};

const app = new Hono<Env>();

function isPaymentSimulationAllowed(env: Env["Bindings"]): boolean {
  return env.ALLOW_PAYMENT_SIMULATION === "true" && env.DARAJA_ENVIRONMENT !== "production";
}

function getDarajaConfig(env: Env["Bindings"], requestUrl: string): DarajaConfig {
  return {
    environment: env.DARAJA_ENVIRONMENT || DEFAULT_SANDBOX_CONFIG.environment,
    consumerKey: env.DARAJA_CONSUMER_KEY || DEFAULT_SANDBOX_CONFIG.consumerKey,
    consumerSecret: env.DARAJA_CONSUMER_SECRET || DEFAULT_SANDBOX_CONFIG.consumerSecret,
    businessShortCode: env.DARAJA_BUSINESS_SHORTCODE || DEFAULT_SANDBOX_CONFIG.businessShortCode,
    passkey: env.DARAJA_PASSKEY || DEFAULT_SANDBOX_CONFIG.passkey,
    callbackUrl: env.DARAJA_CALLBACK_URL || new URL("/api/mpesa/callback", requestUrl).toString(),
  };
}

async function hashPaymentPollToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

app.use("*", async (c, next) => {
  initDB(c.env);
  await ensureSeeded();
  await next();
});

// Authentication middleware
app.use("/api/*", async (c, next) => {
  const path = c.req.path;

  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");

  let token = "";
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const match = cookieHeader.match(/koditrack_session=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  const user = token ? await getSessionUser(token) : null;
  if (user) {
    c.set("user", user);
  }

  // Public endpoints
  if (
    path === "/api/health" ||
    path.startsWith("/api/auth/") ||
    path === "/api/demo-requests" ||
    path.startsWith("/api/mpesa/")
  ) {
    return next();
  }

  // Protected endpoints always require a valid session.
  if (!user) {
    return c.json(
      { error: "Unauthorized. Please sign in." },
      401
    );
  }

  const planExpiresAt = user.plan_expires_at ? Date.parse(user.plan_expires_at) : Number.NaN;
  if (
    user.plan !== "free" &&
    Number.isFinite(planExpiresAt) &&
    planExpiresAt <= Date.now() &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) &&
    !path.startsWith("/api/subscriptions/")
  ) {
    return c.json({
      error: "Your plan has expired. Renew it to make changes; existing records remain available to view and export.",
      code: "SUBSCRIPTION_EXPIRED",
    }, 402);
  }

  return next();
});

// ── First-run data ─────────────────────────────────────────────────
// A deploy applies `schema.sql` as DDL only — a seed INSERT there fails the
// whole build — so the defaults and the sample portfolio are written here,
// once, when their tables are still empty. A re-deploy never resurrects a
// row the user deleted, because the table is no longer empty.

const DEFAULT_SETTINGS: Record<string, string> = {
  default_rent_due_day: "5",
  late_fee_amount: "500",
  late_fee_grace_days: "5",
  currency: "KES",
};

const DEMO_PROPERTIES: Array<[string, string, string, string, string, string, string]> = [
  ["Kilimani Heights", "multi_family", "Argwings Kodhek Rd", "Nairobi", "Nairobi", "00100", "emerald"],
  ["Parklands Plaza Apartments", "multi_family", "3rd Parklands Ave", "Nairobi", "Nairobi", "00100", "sky"],
  ["Karen Haven Villa", "single_family", "Karen Plains Rd", "Nairobi", "Nairobi", "00502", "amber"],
];

/** property index (into DEMO_PROPERTIES), name, beds, baths, sqft, rent, status */
const DEMO_UNITS: Array<[number, string, number, number, number, number, string]> = [
  [0, "Unit A1", 2, 2, 1100, 55000, "occupied"],
  [0, "Unit A2", 1, 1, 650, 35000, "occupied"],
  [1, "Unit B1", 2, 2, 1050, 50000, "vacant"],
  [1, "Unit B2", 3, 2, 1400, 75000, "occupied"],
  [2, "Main Villa", 4, 3, 2800, 120000, "occupied"],
];

const DEMO_VENDORS: Array<[string, string, string, string]> = [
  ["Nairobi Premier Plumbers", "plumber", "+254 712 345 678", "sky"],
  ["Fundi Electric Solutions", "electrician", "+254 722 987 654", "amber"],
  ["Apex Facilities Care", "general", "+254 733 112 233", "emerald"],
];

let seeded = false;
let seeding: Promise<void> | null = null;

async function addColumnIfMissing(table: string, column: string, type: string): Promise<void> {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes(`duplicate column name: ${column.toLowerCase()}`)) {
      throw error;
    }
  }
}

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  if (seeding) return seeding;

  const initialization = (async () => {
    try {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
      }
      await addColumnIfMissing("users", "plan", "TEXT NOT NULL DEFAULT 'free'");
      await addColumnIfMissing("users", "status", "TEXT NOT NULL DEFAULT 'active'");
      await addColumnIfMissing("users", "plan_expires_at", "TEXT");
      await addColumnIfMissing("properties", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
      await addColumnIfMissing("tenants", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
      await addColumnIfMissing("vendors", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
      await addColumnIfMissing("applications", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");

      await run(`
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
        )
      `);
      await run("CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status)");
      await addColumnIfMissing("rent_charges", "amount_credited", "REAL NOT NULL DEFAULT 0");
      await addColumnIfMissing("payments", "applied_amount", "REAL NOT NULL DEFAULT 0");

      await run(`
        CREATE TABLE IF NOT EXISTS rent_credits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
          source_payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
          amount REAL NOT NULL CHECK (amount > 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await run("CREATE INDEX IF NOT EXISTS idx_rent_credits_lease ON rent_credits(lease_id)");
      await run(`
        CREATE TABLE IF NOT EXISTS rent_credit_applications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          credit_id INTEGER NOT NULL REFERENCES rent_credits(id) ON DELETE CASCADE,
          charge_id INTEGER NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
          amount REAL NOT NULL CHECK (amount > 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(credit_id, charge_id)
        )
      `);
      await run("CREATE INDEX IF NOT EXISTS idx_rent_credit_apps_charge ON rent_credit_applications(charge_id)");

      const creditMigration = await get("SELECT value FROM settings WHERE key = 'rent_credit_migration_v1'");
      if (!creditMigration) {
        await run(`
          UPDATE payments AS p
          SET applied_amount = MIN(
            p.amount,
            MAX(0, (SELECT c.amount FROM rent_charges c WHERE c.id = p.charge_id) -
              COALESCE((SELECT SUM(previous.amount) FROM payments previous
                WHERE previous.charge_id = p.charge_id AND previous.id < p.id), 0))
          )
          WHERE p.amount > 0
        `);
        await run(`
          INSERT OR IGNORE INTO rent_credits (lease_id, source_payment_id, amount)
          SELECT c.lease_id, p.id, p.amount - p.applied_amount
          FROM payments p
          JOIN rent_charges c ON c.id = p.charge_id
          WHERE p.amount > p.applied_amount
        `);
        const existingCharges = await query<{ id: number }>("SELECT id FROM rent_charges");
        for (const charge of existingCharges) await syncRentCharge(charge.id);
        await run("INSERT INTO settings (key, value) VALUES ('rent_credit_migration_v1', 'true')");
        const creditedLeases = await query<{ lease_id: number }>("SELECT DISTINCT lease_id FROM rent_credits");
        for (const { lease_id } of creditedLeases) await applyLeaseCredits(lease_id);
      }

      await run(`
        CREATE TABLE IF NOT EXISTS mpesa_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          checkout_request_id TEXT NOT NULL UNIQUE,
          merchant_request_id TEXT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          phone TEXT NOT NULL,
          amount REAL NOT NULL,
          purpose TEXT NOT NULL,
          reference_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          mpesa_receipt TEXT,
          result_desc TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await run("CREATE INDEX IF NOT EXISTS idx_mpesa_checkout ON mpesa_transactions(checkout_request_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_mpesa_user ON mpesa_transactions(user_id)");
      await run("CREATE INDEX IF NOT EXISTS idx_mpesa_status ON mpesa_transactions(status)");

      seeded = true;
    } catch (error) {
      seeded = false;
      throw error;
    } finally {
      seeding = null;
    }
  })();

  seeding = initialization;
  await initialization;
}

async function syncRentCharge(chargeId: number): Promise<void> {
  await run(
    `UPDATE rent_charges
     SET amount_paid = MIN(amount, COALESCE((
           SELECT SUM(p.applied_amount) FROM payments p WHERE p.charge_id = rent_charges.id
         ), 0)),
         amount_credited = COALESCE((
           SELECT SUM(a.amount) FROM rent_credit_applications a WHERE a.charge_id = rent_charges.id
         ), 0),
         status = CASE
           WHEN status = 'waived' THEN 'waived'
           WHEN amount_paid + amount_credited >= amount THEN 'paid'
           WHEN amount_paid + amount_credited > 0 THEN 'partial'
           WHEN due_date < date('now') THEN 'overdue'
           ELSE 'open'
         END
     WHERE id = ?`,
    [chargeId],
  );
}

async function applyLeaseCredits(leaseId: number): Promise<void> {
  const credits = await query<{ id: number; remaining: number }>(
    `SELECT c.id, c.amount - COALESCE(SUM(a.amount), 0) as remaining
     FROM rent_credits c
     LEFT JOIN rent_credit_applications a ON a.credit_id = c.id
     WHERE c.lease_id = ?
     GROUP BY c.id
     HAVING remaining > 0
     ORDER BY c.created_at, c.id`,
    [leaseId],
  );
  const charges = await query<{
    id: number;
    amount: number;
    applied_amount: number;
    amount_paid: number;
    amount_credited: number;
  }>(
    `SELECT id, amount, amount_paid, amount_credited
     FROM rent_charges
     WHERE lease_id = ? AND status != 'waived' AND amount > amount_paid + amount_credited
     ORDER BY period, due_date, id`,
    [leaseId],
  );

  for (const credit of credits) {
    let remaining = credit.remaining;
    for (const charge of charges) {
      const balance = Math.max(0, charge.amount - charge.amount_paid - charge.amount_credited);
      if (remaining <= 0 || balance <= 0) continue;
      const amount = Math.min(remaining, balance);
      const result = await run(
        "INSERT OR IGNORE INTO rent_credit_applications (credit_id, charge_id, amount) VALUES (?, ?, ?)",
        [credit.id, charge.id, amount],
      );
      if (result.changes) {
        await syncRentCharge(charge.id);
        charge.amount_credited += amount;
        remaining -= amount;
      }
    }
  }
}

async function recordRentReceipt(input: {
  chargeId: number;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paidAt?: string;
}): Promise<{ paymentId: number; appliedAmount: number; creditCreated: number; charge: Record<string, unknown> | undefined } | null> {
  const charge = await get<{ id: number; lease_id: number; amount: number; amount_paid: number; amount_credited: number }>(
    `SELECT c.id, c.lease_id, c.amount, c.amount_paid, c.amount_credited
     FROM rent_charges c WHERE c.id = ?`,
    [input.chargeId],
  );
  if (!charge) return null;

  if (input.reference) {
    const existing = await get<{ id: number; charge_id: number; amount: number; applied_amount: number }>(
      "SELECT id, charge_id, amount, applied_amount FROM payments WHERE method = ? AND reference = ?",
      [input.method, input.reference],
    );
    if (existing) {
      if (existing.charge_id !== input.chargeId || existing.amount !== input.amount) {
        throw new Error("Payment reference is already recorded with different payment details");
      }
      return {
        paymentId: existing.id,
        appliedAmount: existing.applied_amount,
        creditCreated: existing.amount - existing.applied_amount,
        charge: await get(`${CHARGE_SELECT} WHERE c.id = ?`, [input.chargeId]),
      };
    }
  }

  const balance = Math.max(0, charge.amount - charge.amount_paid - charge.amount_credited);
  const appliedAmount = Math.min(input.amount, balance);
  const creditCreated = input.amount - appliedAmount;
  const result = await run(
    `INSERT INTO payments (charge_id, paid_at, amount, applied_amount, method, reference, notes)
     VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?)`,
    [input.chargeId, input.paidAt ?? null, input.amount, appliedAmount, input.method, input.reference, input.notes],
  );
  if (creditCreated > 0) {
    await run(
      "INSERT INTO rent_credits (lease_id, source_payment_id, amount) VALUES (?, ?, ?)",
      [charge.lease_id, result.lastInsertRowid, creditCreated],
    );
  }
  await syncRentCharge(input.chargeId);
  await applyLeaseCredits(charge.lease_id);

  return {
    paymentId: result.lastInsertRowid,
    appliedAmount,
    creditCreated,
    charge: await get(`${CHARGE_SELECT} WHERE c.id = ?`, [input.chargeId]),
  };
}

// ── Helpers ────────────────────────────────────────────────────────

const intParam = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
};

async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, data: parsed.data };
}

function buildUpdate(fields: Record<string, unknown>): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); params.push(v); }
  }
  return { sets, params };
}

// ── Authentication ─────────────────────────────────────────────────

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.get("/api/auth/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");
  let token = "";
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const match = cookieHeader.match(/koditrack_session=([^;]+)/);
    if (match) token = match[1];
  }

  const user = token ? await getSessionUser(token) : null;
  const userCount = await get<{ n: number }>("SELECT COUNT(*) as n FROM users");

  return c.json({
    user,
    needs_setup: (userCount?.n ?? 0) === 0,
  });
});

app.post("/api/auth/register", async (c) => {
  return c.json({ error: "Choose a paid plan to create an account; direct free registration is unavailable." }, 410);
});

app.post("/api/auth/login", async (c) => {
  const parsed = await parseJson(c, LoginInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const row = await get<{ id: number; email: string; name: string; phone: string | null; role: string; plan?: string; status?: string; plan_expires_at?: string | null; created_at: string; password_hash: string; salt: string }>(
    "SELECT id, email, name, phone, role, COALESCE(plan, 'free') as plan, COALESCE(status, 'active') as status, plan_expires_at, created_at, password_hash, salt FROM users WHERE email = ?",
    [normalizedEmail]
  );
  if (!row) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (row.status === "cancelled" || row.status === "inactive") {
    return c.json({ error: "This account has been cancelled / unsubscribed. Please contact support to reactivate your access." }, 403);
  }

  const valid = await verifyPassword(password, row.password_hash, row.salt);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await createSession(row.id);
  const user: User = {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    plan: row.plan || "free",
    status: row.status || "active",
    plan_expires_at: row.plan_expires_at ?? null,
    created_at: row.created_at,
  };

  c.header("Set-Cookie", `koditrack_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`);
  return c.json({ user, token });
});

app.patch("/api/auth/profile", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const { name, phone } = body as { name?: string; phone?: string };

  const updates: string[] = [];
  const params: unknown[] = [];
  if (name && name.trim().length >= 2) {
    updates.push("name = ?");
    params.push(name.trim());
  }
  if (phone !== undefined) {
    updates.push("phone = ?");
    params.push(phone ? phone.trim() : null);
  }
  if (updates.length > 0) {
    params.push(user.id);
    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);
  }

  const updatedUser = await get<User>(
    "SELECT id, email, name, phone, role, COALESCE(plan, 'free') as plan, COALESCE(status, 'active') as status, plan_expires_at, created_at FROM users WHERE id = ?",
    [user.id]
  );

  return c.json({ user: updatedUser });
});

app.post("/api/feedback", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const { category, message, rating } = body as { category?: string; message?: string; rating?: number };
  if (!message || message.trim().length === 0) {
    return c.json({ error: "Message cannot be empty." }, 400);
  }

  await run(
    "INSERT INTO feedback (user_id, email, category, message, rating, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
    [user.id, user.email, category || "general", message.trim(), rating ?? null]
  );

  return c.json({ ok: true, message: "Thank you! Your feedback has been received and forwarded to our team." });
});

app.post("/api/subscriptions/unsubscribe", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const { reason, notes, offer_declined } = body as { reason?: string; notes?: string; offer_declined?: boolean };

  await run(
    "INSERT INTO feedback (user_id, email, category, message, created_at) VALUES (?, ?, 'cancellation', ?, datetime('now'))",
    [user.id, user.email, `[CANCELLATION] Reason: ${reason || "Not specified"} | Notes: ${notes || "None"} | Retention Offer Declined: ${Boolean(offer_declined)}`]
  ).catch(() => {});

  // Mark account as cancelled
  await run("UPDATE users SET status = 'cancelled' WHERE id = ?", [user.id]);
  // Terminate all sessions
  await run("DELETE FROM sessions WHERE user_id = ?", [user.id]);

  c.header("Set-Cookie", "koditrack_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return c.json({ ok: true, message: "Subscription cancelled successfully. You have been securely logged out." });
});

app.post("/api/auth/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");
  let token = "";
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (cookieHeader) {
    const match = cookieHeader.match(/koditrack_session=([^;]+)/);
    if (match) token = match[1];
  }
  if (token) {
    await deleteSession(token);
  }
  c.header("Set-Cookie", "koditrack_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return c.json({ ok: true });
});

// ── Properties ─────────────────────────────────────────────────────

const PropertyInput = z.object({
  name: z.string().min(1),
  type: z.enum(["single_family", "multi_family", "condo", "townhouse", "commercial"]).optional(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  year_built: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  color: z.string().optional(),
});

app.get("/api/properties", async (c) => {
  const user = c.get("user")!;
  const rows = await query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) as unit_count,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.status = 'occupied') as occupied_count
     FROM properties p WHERE p.user_id = ? ORDER BY p.name`,
    [user.id],
  );
  return c.json({ properties: rows });
});

app.get("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const row = await get("SELECT * FROM properties WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ property: row });
});

app.post("/api/properties", async (c) => {
  const parsed = await parseJson(c, PropertyInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const user = c.get("user")!;
  const limits = getPlanLimits(user.plan || "free");
  if (limits.properties !== null) {
    const count = await get<{ n: number }>("SELECT COUNT(*) as n FROM properties WHERE user_id = ?", [user.id]);
    if ((count?.n ?? 0) >= limits.properties) {
      return c.json({
        error: `Property limit reached (${count?.n ?? 0}/${limits.properties} properties). Upgrade your plan to add another property.`,
        code: "PROPERTY_LIMIT_REACHED",
        current: count?.n ?? 0,
        limit: limits.properties,
      }, 403);
    }
  }
  const result = await run(
    `INSERT INTO properties (user_id, name, type, address, city, state, zip, year_built, notes, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, d.name, d.type ?? "single_family", d.address ?? null, d.city ?? null, d.state ?? null, d.zip ?? null, d.year_built ?? null, d.notes ?? null, d.color ?? "sky"],
  );
  const row = await get("SELECT * FROM properties WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ property: row }, 201);
});

app.put("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const parsed = await parseJson(c, PropertyInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id, user.id);
  const r = await run(`UPDATE properties SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM properties WHERE id = ?", [id]);
  return c.json({ property: row });
});

app.delete("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const r = await run("DELETE FROM properties WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Units ──────────────────────────────────────────────────────────

const UnitInput = z.object({
  property_id: z.number().int(),
  name: z.string().min(1),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  sqft: z.number().int().optional().nullable(),
  market_rent: z.number().min(0).optional(),
  status: z.enum(["vacant", "occupied", "turnover", "unavailable"]).optional(),
  notes: z.string().optional().nullable(),
});

const UNIT_SELECT = `
  SELECT u.*,
    p.name as property_name,
    p.color as property_color,
    p.address as property_address,
    p.city as property_city,
    (SELECT l.id FROM leases l WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_lease_id,
    (SELECT t.first_name || ' ' || t.last_name FROM leases l LEFT JOIN tenants t ON t.id = l.primary_tenant_id WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_tenant_name
  FROM units u
  JOIN properties p ON p.id = u.property_id
`;

app.get("/api/units", async (c) => {
  const user = c.get("user")!;
  const propertyId = intParam(c.req.query("property_id"));
  const status = c.req.query("status");
  const where: string[] = ["p.user_id = ?"];
  const params: unknown[] = [user.id];
  if (propertyId) { where.push("u.property_id = ?"); params.push(propertyId); }
  if (status) { where.push("u.status = ?"); params.push(status); }
  const sql = `${UNIT_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.name, u.name`;
  const rows = await query(sql, params);
  return c.json({ units: rows });
});

app.get("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const row = await get(`${UNIT_SELECT} WHERE u.id = ? AND p.user_id = ?`, [id, user.id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ unit: row });
});

app.post("/api/units", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, UnitInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  // 1. Verify property belongs to user
  const prop = await get("SELECT id FROM properties WHERE id = ? AND user_id = ?", [d.property_id, user.id]);
  if (!prop) return c.json({ error: "Property not found or access denied" }, 404);

  // 2. Enforce unit limit based on plan
  const plan = user.plan || "free";
  const limit = getPlanLimits(plan).units;
  const countRow = await get<{ n: number }>(
    "SELECT COUNT(*) as n FROM units u JOIN properties p ON p.id = u.property_id WHERE p.user_id = ?",
    [user.id]
  );
  const currentCount = countRow?.n ?? 0;
  if (currentCount >= limit) {
    return c.json(
      {
        error: `Unit limit reached (${currentCount}/${limit} units used on your ${plan.toUpperCase()} plan). Upgrade your plan to add more rental units.`,
        code: "UNIT_LIMIT_REACHED",
        current: currentCount,
        limit,
      },
      403
    );
  }

  const result = await run(
    `INSERT INTO units (property_id, name, bedrooms, bathrooms, sqft, market_rent, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.property_id, d.name, d.bedrooms ?? 1, d.bathrooms ?? 1, d.sqft ?? null, d.market_rent ?? 0, d.status ?? "vacant", d.notes ?? null],
  );
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [result.lastInsertRowid]);
  return c.json({ unit: row }, 201);
});

app.put("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const existing = await get("SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?", [id, user.id]);
  if (!existing) return c.json({ error: "Unit not found" }, 404);

  const parsed = await parseJson(c, UnitInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  if (parsed.data.property_id !== undefined) {
    const property = await get("SELECT id FROM properties WHERE id = ? AND user_id = ?", [parsed.data.property_id, user.id]);
    if (!property) return c.json({ error: "Property not found or access denied" }, 404);
  }
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE units SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  return c.json({ unit: row });
});

app.delete("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const existing = await get("SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?", [id, user.id]);
  if (!existing) return c.json({ error: "Unit not found" }, 404);

  const r = await run("DELETE FROM units WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Tenants ────────────────────────────────────────────────────────

const TenantInput = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  emergency_contact: z.string().optional().nullable(),
  employer: z.string().optional().nullable(),
  monthly_income: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

app.get("/api/tenants", async (c) => {
  const user = c.get("user")!;
  const search = c.req.query("q")?.trim();
  if (search) {
    const like = `%${search}%`;
    const rows = await query(
      `SELECT t.*,
         (SELECT u.id FROM leases l LEFT JOIN units u ON u.id = l.unit_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_id,
         (SELECT u.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_name,
         (SELECT p.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_property_name
       FROM tenants t
       WHERE t.user_id = ? AND (t.last_name LIKE ? OR t.first_name LIKE ? OR t.email LIKE ? OR t.phone LIKE ?)
       ORDER BY t.last_name, t.first_name LIMIT 200`,
      [user.id, like, like, like, like],
    );
    return c.json({ tenants: rows });
  }
  const rows = await query(
    `SELECT t.*,
       (SELECT u.id FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_id,
       (SELECT u.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_name,
       (SELECT p.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_property_name
     FROM tenants t WHERE t.user_id = ? ORDER BY t.last_name, t.first_name LIMIT 500`,
    [user.id],
  );
  return c.json({ tenants: rows });
});

app.get("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const row = await get("SELECT * FROM tenants WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ tenant: row });
});

app.post("/api/tenants", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, TenantInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO tenants (user_id, first_name, last_name, email, phone, date_of_birth, emergency_contact, employer, monthly_income, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, d.first_name, d.last_name, d.email ?? null, d.phone ?? null, d.date_of_birth ?? null, d.emergency_contact ?? null, d.employer ?? null, d.monthly_income ?? null, d.notes ?? null],
  );
  const row = await get("SELECT * FROM tenants WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ tenant: row }, 201);
});

app.put("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const parsed = await parseJson(c, TenantInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id, user.id);
  const r = await run(`UPDATE tenants SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM tenants WHERE id = ?", [id]);
  return c.json({ tenant: row });
});

app.delete("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const r = await run("DELETE FROM tenants WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Leases ─────────────────────────────────────────────────────────

const LeaseInput = z.object({
  unit_id: z.number().int(),
  primary_tenant_id: z.number().int().nullable().optional(),
  start_date: z.string(),
  end_date: z.string(),
  monthly_rent: z.number().min(0).optional(),
  deposit: z.number().min(0).optional(),
  rent_due_day: z.number().int().min(1).max(31).optional(),
  late_fee: z.number().min(0).optional(),
  status: z.enum(["upcoming", "active", "ended", "cancelled"]).optional(),
  notes: z.string().optional().nullable(),
});

const LEASE_SELECT = `
  SELECT l.*,
    u.name as unit_name,
    p.id as property_id, p.name as property_name, p.color as property_color,
    t.first_name as tenant_first_name, t.last_name as tenant_last_name,
    t.email as tenant_email, t.phone as tenant_phone
  FROM leases l
  JOIN units u ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.id = l.primary_tenant_id
`;

app.get("/api/leases", async (c) => {
  const user = c.get("user")!;
  const status = c.req.query("status");
  const tenantId = intParam(c.req.query("tenant_id"));
  const unitId = intParam(c.req.query("unit_id"));
  const where: string[] = ["p.user_id = ?"];
  const params: unknown[] = [user.id];
  if (status) { where.push("l.status = ?"); params.push(status); }
  if (tenantId) { where.push("l.primary_tenant_id = ?"); params.push(tenantId); }
  if (unitId) { where.push("l.unit_id = ?"); params.push(unitId); }
  const sql = `${LEASE_SELECT} WHERE ${where.join(" AND ")} ORDER BY l.start_date DESC`;
  const rows = await query(sql, params);
  return c.json({ leases: rows });
});

app.get("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const row = await get(`${LEASE_SELECT} WHERE l.id = ? AND p.user_id = ?`, [id, user.id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ lease: row });
});

app.post("/api/leases", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, LeaseInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  // Verify unit belongs to user
  const unit = await get("SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?", [d.unit_id, user.id]);
  if (!unit) return c.json({ error: "Unit not found or access denied" }, 404);
  if (d.primary_tenant_id != null) {
    const tenant = await get("SELECT id FROM tenants WHERE id = ? AND user_id = ?", [d.primary_tenant_id, user.id]);
    if (!tenant) return c.json({ error: "Tenant not found or access denied" }, 404);
  }

  const result = await run(
    `INSERT INTO leases (unit_id, primary_tenant_id, start_date, end_date, monthly_rent, deposit, rent_due_day, late_fee, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.unit_id, d.primary_tenant_id ?? null, d.start_date, d.end_date, d.monthly_rent ?? 0, d.deposit ?? 0, d.rent_due_day ?? 1, d.late_fee ?? 0, d.status ?? "active", d.notes ?? null],
  );
  // Mark the unit as occupied if the new lease is active.
  if ((d.status ?? "active") === "active") {
    await run("UPDATE units SET status = 'occupied' WHERE id = ?", [d.unit_id]);
  }
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [result.lastInsertRowid]);
  return c.json({ lease: row }, 201);
});

app.put("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const existing = await get("SELECT l.id FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE l.id = ? AND p.user_id = ?", [id, user.id]);
  if (!existing) return c.json({ error: "Lease not found" }, 404);

  const parsed = await parseJson(c, LeaseInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const patch = parsed.data;
  if (patch.unit_id !== undefined) {
    const unit = await get(
      "SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?",
      [patch.unit_id, user.id],
    );
    if (!unit) return c.json({ error: "Unit not found or access denied" }, 404);
  }
  if (patch.primary_tenant_id != null) {
    const tenant = await get("SELECT id FROM tenants WHERE id = ? AND user_id = ?", [patch.primary_tenant_id, user.id]);
    if (!tenant) return c.json({ error: "Tenant not found or access denied" }, 404);
  }
  const { sets, params } = buildUpdate(patch);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE leases SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [id]);
  return c.json({ lease: row });
});

app.delete("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const existing = await get("SELECT l.id FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE l.id = ? AND p.user_id = ?", [id, user.id]);
  if (!existing) return c.json({ error: "Lease not found" }, 404);

  const r = await run("DELETE FROM leases WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Rent charges & payments ────────────────────────────────────────

const ChargeInput = z.object({
  lease_id: z.number().int(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  due_date: z.string(),
  amount: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});

const CHARGE_SELECT = `
  SELECT c.*,
    l.unit_id, l.monthly_rent as lease_rent, l.rent_due_day,
    u.name as unit_name,
    p.id as property_id, p.name as property_name, p.color as property_color,
    t.id as tenant_id, t.first_name as tenant_first_name, t.last_name as tenant_last_name
  FROM rent_charges c
  JOIN leases l ON l.id = c.lease_id
  JOIN units u ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.id = l.primary_tenant_id
`;

app.get("/api/rent-charges", async (c) => {
  const user = c.get("user")!;
  const period = c.req.query("period");
  const status = c.req.query("status");
  const where: string[] = ["p.user_id = ?"];
  const params: unknown[] = [user.id];
  if (period) { where.push("c.period = ?"); params.push(period); }
  if (status) { where.push("c.status = ?"); params.push(status); }
  const sql = `${CHARGE_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.due_date, p.name, u.name`;
  const rows = await query(sql, params);
  return c.json({ charges: rows });
});

app.get("/api/rent-credits", async (c) => {
  const user = c.get("user")!;
  const credits = await query<{
    lease_id: number;
    property_name: string;
    unit_name: string;
    tenant_name: string | null;
    balance: number;
  }>(
    `SELECT l.id as lease_id, p.name as property_name, u.name as unit_name,
       CASE WHEN t.first_name IS NOT NULL THEN t.first_name || ' ' || t.last_name ELSE NULL END as tenant_name,
       SUM(credit.amount - COALESCE(applied.amount, 0)) as balance
     FROM rent_credits credit
     JOIN leases l ON l.id = credit.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     LEFT JOIN (
       SELECT credit_id, SUM(amount) as amount
       FROM rent_credit_applications
       GROUP BY credit_id
     ) applied ON applied.credit_id = credit.id
     WHERE p.user_id = ?
     GROUP BY l.id, p.name, u.name, t.first_name, t.last_name
     HAVING balance > 0
     ORDER BY p.name, u.name`,
    [user.id],
  );
  return c.json({ credits, total: credits.reduce((sum, credit) => sum + credit.balance, 0) });
});

app.post("/api/rent-charges", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, ChargeInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  // Verify lease belongs to user
  const lease = await get<{ id: number; monthly_rent: number }>(
    "SELECT l.id, l.monthly_rent FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE l.id = ? AND p.user_id = ?",
    [d.lease_id, user.id],
  );
  if (!lease) return c.json({ error: "Lease not found or access denied" }, 404);

  const result = await run(
    `INSERT INTO rent_charges (lease_id, period, due_date, amount, notes) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(lease_id, period) DO NOTHING`,
    [d.lease_id, d.period, d.due_date, d.amount ?? lease.monthly_rent, d.notes ?? null],
  );
  if (!result.changes) {
    const existing = await get(`${CHARGE_SELECT} WHERE c.lease_id = ? AND c.period = ?`, [d.lease_id, d.period]);
    return c.json({ charge: existing });
  }
  await applyLeaseCredits(d.lease_id);
  const row = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [result.lastInsertRowid]);
  return c.json({ charge: row }, 201);
});

// Generate (idempotent) charges for a given period across all active leases.
app.post("/api/rent-charges/generate", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({})) as { period?: string };
  const period = body.period;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return c.json({ error: "period (YYYY-MM) required" }, 400);
  const leases = await query<{ id: number; monthly_rent: number; rent_due_day: number; start_date: string; end_date: string }>(
    `SELECT l.id, l.monthly_rent, l.rent_due_day, l.start_date, l.end_date
     FROM leases l
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE p.user_id = ? AND l.status = 'active'`,
    [user.id],
  );
  let created = 0;
  for (const l of leases) {
    // Skip if the lease doesn't cover this period at all.
    const periodStart = `${period}-01`;
    if (l.end_date < periodStart) continue;
    const day = String(Math.min(28, Math.max(1, l.rent_due_day))).padStart(2, "0");
    const dueDate = `${period}-${day}`;
    const r = await run(
      `INSERT INTO rent_charges (lease_id, period, due_date, amount) VALUES (?, ?, ?, ?)
         ON CONFLICT(lease_id, period) DO NOTHING`,
      [l.id, period, dueDate, l.monthly_rent],
    );
    if (r.changes) created++;
    await applyLeaseCredits(l.id);
  }
  // Re-mark anything past due as 'overdue'.
  await run(
    `UPDATE rent_charges SET status = 'overdue'
     WHERE status IN ('open', 'partial') AND amount_paid + amount_credited < amount AND due_date < date('now')
       AND lease_id IN (SELECT l.id FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE p.user_id = ?)`,
    [user.id],
  );
  return c.json({ created, period });
});

app.put("/api/rent-charges/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const Patch = z.object({
    amount: z.number().min(0).optional(),
    due_date: z.string().optional(),
    status: z.enum(["open", "partial", "paid", "overdue", "waived"]).optional(),
    notes: z.string().optional().nullable(),
  });
  const parsed = await parseJson(c, Patch);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  if (parsed.data.amount !== undefined) {
    const current = await get<{ amount_paid: number; amount_credited: number }>(
      `SELECT c.amount_paid, c.amount_credited
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE c.id = ? AND p.user_id = ?`,
      [id, user.id],
    );
    if (!current) return c.json({ error: "Not found" }, 404);
    if (parsed.data.amount < current.amount_paid + current.amount_credited) {
      return c.json({ error: "Charge amount cannot be reduced below the payments and credits already applied." }, 409);
    }
  }
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id, user.id);
  const r = await run(
    `UPDATE rent_charges SET ${sets.join(", ")}
     WHERE id = ? AND lease_id IN (
       SELECT l.id FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ?
     )`,
    params,
  );
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${CHARGE_SELECT} WHERE c.id = ? AND p.user_id = ?`, [id, user.id]);
  return c.json({ charge: row });
});

app.delete("/api/rent-charges/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const r = await run(
    `DELETE FROM rent_charges
     WHERE id = ? AND lease_id IN (
       SELECT l.id FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ?
     )`,
    [id, user.id],
  );
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

const PaymentInput = z.object({
  charge_id: z.number().int(),
  paid_at: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["mpesa", "bank_transfer", "cash", "check", "credit", "other"]).optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

app.get("/api/rent-charges/:id/payments", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const rows = await query(
    `SELECT p.*
     FROM payments p
     JOIN rent_charges c ON c.id = p.charge_id
     JOIN leases l ON l.id = c.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties pr ON pr.id = u.property_id
     WHERE c.id = ? AND pr.user_id = ?
     ORDER BY p.paid_at DESC`,
    [id, user.id],
  );
  return c.json({ payments: rows });
});

app.post("/api/payments", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, PaymentInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const charge = await get<{ id: number; lease_id: number }>(
    `SELECT c.id, c.lease_id
     FROM rent_charges c
     JOIN leases l ON l.id = c.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties pr ON pr.id = u.property_id
     WHERE c.id = ? AND pr.user_id = ?`,
    [d.charge_id, user.id],
  );
  if (!charge) return c.json({ error: "Charge not found or access denied" }, 404);

  // Prevent duplicate payment reference on the same charge
  if (d.reference?.trim()) {
    const dup = await get<{ id: number }>(
      `SELECT p.id FROM payments p
       JOIN rent_charges c ON c.id = p.charge_id
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties pr ON pr.id = u.property_id
       WHERE pr.user_id = ? AND p.reference = ?`,
      [user.id, d.reference.trim()],
    );
    if (dup) {
      return c.json({ error: `Payment reference '${d.reference.trim()}' has already been recorded for this charge.` }, 409);
    }
  }

  const recorded = await recordRentReceipt({
    chargeId: d.charge_id,
    amount: d.amount,
    method: d.method ?? "mpesa",
    reference: d.reference?.trim() || null,
    notes: d.notes ?? null,
    paidAt: d.paid_at,
  });
  if (!recorded) return c.json({ error: "Charge not found or access denied" }, 404);
  const payment = await get("SELECT * FROM payments WHERE id = ?", [recorded.paymentId]);
  const leaseCredit = await get<{ balance: number }>(
    `SELECT COALESCE(SUM(credit.amount - COALESCE(applied.amount, 0)), 0) as balance
     FROM rent_credits credit
     LEFT JOIN (
       SELECT credit_id, SUM(amount) as amount
       FROM rent_credit_applications
       GROUP BY credit_id
     ) applied ON applied.credit_id = credit.id
     WHERE credit.lease_id = ?`,
    [charge.lease_id],
  );
  return c.json({
    charge: recorded.charge,
    payment,
    applied_amount: recorded.appliedAmount,
    credit_created: recorded.creditCreated,
    remaining_lease_credit: leaseCredit?.balance ?? 0,
  }, 201);
});

app.get("/api/payments/:id/receipt", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;

  const receipt = await get<{
    id: number;
    amount: number;
    applied_amount: number;
    paid_at: string;
    method: string;
    reference: string | null;
    notes: string | null;
    charge_id: number;
    charge_amount: number;
    charge_amount_paid: number;
    charge_amount_credited: number;
    charge_period: string;
    due_date: string;
    unit_name: string;
    property_name: string;
    property_address: string | null;
    property_city: string | null;
    tenant_name: string | null;
    tenant_phone: string | null;
    tenant_email: string | null;
  }>(
    `SELECT p.id, p.amount, p.applied_amount, p.paid_at, p.method, p.reference, p.notes,
       c.id as charge_id, c.amount as charge_amount, c.amount_paid as charge_amount_paid,
       c.amount_credited as charge_amount_credited,
       c.period as charge_period, c.due_date,
       u.name as unit_name,
       pr.name as property_name, pr.address as property_address, pr.city as property_city,
       CASE WHEN t.first_name IS NOT NULL THEN (t.first_name || ' ' || t.last_name) ELSE NULL END as tenant_name,
       t.phone as tenant_phone, t.email as tenant_email
     FROM payments p
     JOIN rent_charges c ON c.id = p.charge_id
     JOIN leases l ON l.id = c.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties pr ON pr.id = u.property_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     WHERE p.id = ? AND pr.user_id = ?`,
    [id, user.id],
  );

  if (!receipt) return c.json({ error: "Payment not found or access denied" }, 404);
  return c.json({ receipt });
});

app.delete("/api/payments/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const row = await get<{ charge_id: number; lease_id: number }>(
    `SELECT p.charge_id, l.id as lease_id FROM payments p
     JOIN rent_charges c ON c.id = p.charge_id
     JOIN leases l ON l.id = c.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties pr ON pr.id = u.property_id
     WHERE p.id = ? AND pr.user_id = ?`,
    [id, user.id]
  );
  if (!row) return c.json({ error: "Not found or access denied" }, 404);
  const credit = await get<{ id: number }>("SELECT id FROM rent_credits WHERE source_payment_id = ?", [id]);
  const affectedCharges = credit
    ? await query<{ charge_id: number }>("SELECT charge_id FROM rent_credit_applications WHERE credit_id = ?", [credit.id])
    : [];
  if (credit) {
    await run("DELETE FROM rent_credit_applications WHERE credit_id = ?", [credit.id]);
    await run("DELETE FROM rent_credits WHERE id = ?", [credit.id]);
  }
  await run("DELETE FROM payments WHERE id = ?", [id]);
  await syncRentCharge(row.charge_id);
  for (const affected of affectedCharges) {
    await syncRentCharge(affected.charge_id);
  }
  await applyLeaseCredits(row.lease_id);
  return c.json({ ok: true });
});

// ── Vendors ────────────────────────────────────────────────────────

const VendorInput = z.object({
  name: z.string().min(1),
  category: z.enum(["plumber", "electrician", "hvac", "handyman", "cleaning", "landscaping", "general"]).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  color: z.string().optional(),
});

app.get("/api/vendors", async (c) => {
  const user = c.get("user")!;
  const rows = await query("SELECT * FROM vendors WHERE user_id = ? ORDER BY name", [user.id]);
  return c.json({ vendors: rows });
});

app.post("/api/vendors", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, VendorInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    "INSERT INTO vendors (user_id, name, category, phone, email, notes, color) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [user.id, d.name, d.category ?? "general", d.phone ?? null, d.email ?? null, d.notes ?? null, d.color ?? "slate"],
  );
  const row = await get("SELECT * FROM vendors WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ vendor: row }, 201);
});

app.put("/api/vendors/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const parsed = await parseJson(c, VendorInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id, user.id);
  const r = await run(`UPDATE vendors SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM vendors WHERE id = ?", [id]);
  return c.json({ vendor: row });
});

app.delete("/api/vendors/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const r = await run("DELETE FROM vendors WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Work orders ────────────────────────────────────────────────────

const WorkOrderInput = z.object({
  property_id: z.number().int().nullable().optional(),
  unit_id: z.number().int().nullable().optional(),
  tenant_id: z.number().int().nullable().optional(),
  vendor_id: z.number().int().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["open", "assigned", "in_progress", "completed", "cancelled"]).optional(),
  scheduled_at: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const WO_SELECT = `
  SELECT w.*,
    p.name as property_name, p.color as property_color,
    u.name as unit_name,
    t.first_name as tenant_first_name, t.last_name as tenant_last_name,
    v.name as vendor_name, v.color as vendor_color
  FROM work_orders w
  JOIN properties p ON p.id = w.property_id
  LEFT JOIN units u ON u.id = w.unit_id
  LEFT JOIN tenants t ON t.id = w.tenant_id
  LEFT JOIN vendors v ON v.id = w.vendor_id
`;

app.get("/api/work-orders", async (c) => {
  const user = c.get("user")!;
  const status = c.req.query("status");
  const propertyId = intParam(c.req.query("property_id"));
  const where: string[] = ["p.user_id = ?"];
  const params: unknown[] = [user.id];
  if (status) { where.push("w.status = ?"); params.push(status); }
  if (propertyId) { where.push("w.property_id = ?"); params.push(propertyId); }
  const sql = `${WO_SELECT} WHERE ${where.join(" AND ")} ORDER BY
    CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    w.created_at DESC`;
  const rows = await query(sql, params);
  return c.json({ work_orders: rows });
});

app.post("/api/work-orders", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, WorkOrderInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  let propertyId = d.property_id ?? null;

  if (propertyId != null) {
    const prop = await get("SELECT id FROM properties WHERE id = ? AND user_id = ?", [propertyId, user.id]);
    if (!prop) return c.json({ error: "Property not found or access denied" }, 404);
  }
  if (d.unit_id != null) {
    const unit = await get<{ property_id: number }>(
      "SELECT u.property_id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?",
      [d.unit_id, user.id],
    );
    if (!unit) return c.json({ error: "Unit not found or access denied" }, 404);
    if (propertyId != null && propertyId !== unit.property_id) {
      return c.json({ error: "The selected unit does not belong to this property" }, 400);
    }
    propertyId ??= unit.property_id;
  }
  if (d.tenant_id != null) {
    const tenant = await get("SELECT id FROM tenants WHERE id = ? AND user_id = ?", [d.tenant_id, user.id]);
    if (!tenant) return c.json({ error: "Tenant not found or access denied" }, 404);
  }
  if (d.vendor_id != null) {
    const vendor = await get("SELECT id FROM vendors WHERE id = ? AND user_id = ?", [d.vendor_id, user.id]);
    if (!vendor) return c.json({ error: "Vendor not found or access denied" }, 404);
  }

  const result = await run(
    `INSERT INTO work_orders (property_id, unit_id, tenant_id, vendor_id, title, description, priority, status, scheduled_at, completed_at, cost, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      propertyId, d.unit_id ?? null, d.tenant_id ?? null, d.vendor_id ?? null,
      d.title, d.description ?? null,
      d.priority ?? "normal", d.status ?? "open",
      d.scheduled_at ?? null, d.completed_at ?? null,
      d.cost ?? null, d.notes ?? null,
    ],
  );
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [result.lastInsertRowid]);
  return c.json({ work_order: row }, 201);
});

app.put("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const existing = await get<{ id: number; property_id: number | null; unit_id: number | null }>(
    "SELECT w.id, w.property_id, w.unit_id FROM work_orders w JOIN properties p ON p.id = w.property_id WHERE w.id = ? AND p.user_id = ?",
    [id, user.id],
  );
  if (!existing) return c.json({ error: "Work order not found" }, 404);

  const parsed = await parseJson(c, WorkOrderInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const patch = { ...parsed.data };
  let propertyId = patch.property_id === undefined ? existing.property_id : patch.property_id;
  const unitId = patch.unit_id === undefined ? existing.unit_id : patch.unit_id;

  if (propertyId != null) {
    const property = await get("SELECT id FROM properties WHERE id = ? AND user_id = ?", [propertyId, user.id]);
    if (!property) return c.json({ error: "Property not found or access denied" }, 404);
  }
  if (unitId != null) {
    const unit = await get<{ property_id: number }>(
      "SELECT u.property_id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?",
      [unitId, user.id],
    );
    if (!unit) return c.json({ error: "Unit not found or access denied" }, 404);
    if (propertyId != null && propertyId !== unit.property_id) {
      return c.json({ error: "The selected unit does not belong to this property" }, 400);
    }
    if (propertyId == null) {
      propertyId = unit.property_id;
      patch.property_id = propertyId;
    }
  }
  if (patch.tenant_id != null) {
    const tenant = await get("SELECT id FROM tenants WHERE id = ? AND user_id = ?", [patch.tenant_id, user.id]);
    if (!tenant) return c.json({ error: "Tenant not found or access denied" }, 404);
  }
  if (patch.vendor_id != null) {
    const vendor = await get("SELECT id FROM vendors WHERE id = ? AND user_id = ?", [patch.vendor_id, user.id]);
    if (!vendor) return c.json({ error: "Vendor not found or access denied" }, 404);
  }
  const { sets, params } = buildUpdate(patch);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id, user.id);
  const r = await run(
    `UPDATE work_orders SET ${sets.join(", ")}
     WHERE id = ? AND property_id IN (SELECT id FROM properties WHERE user_id = ?)`,
    params,
  );
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${WO_SELECT} WHERE w.id = ? AND p.user_id = ?`, [id, user.id]);
  return c.json({ work_order: row });
});

app.delete("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const existing = await get("SELECT w.id FROM work_orders w JOIN properties p ON p.id = w.property_id WHERE w.id = ? AND p.user_id = ?", [id, user.id]);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const r = await run("DELETE FROM work_orders WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Applications ───────────────────────────────────────────────────

const ApplicationInput = z.object({
  unit_id: z.number().int().nullable().optional(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  monthly_income: z.number().optional().nullable(),
  employer: z.string().optional().nullable(),
  desired_move_in: z.string().optional().nullable(),
  status: z.enum(["new", "screening", "approved", "declined", "withdrawn"]).optional(),
  notes: z.string().optional().nullable(),
});

app.get("/api/applications", async (c) => {
  const user = c.get("user")!;
  const rows = await query(
    `SELECT a.*, u.name as unit_name, p.name as property_name
     FROM applications a
     LEFT JOIN units u ON u.id = a.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
     WHERE a.user_id = ? OR (a.user_id IS NULL AND p.user_id = ?)
     ORDER BY a.created_at DESC`,
    [user.id, user.id],
  );
  return c.json({ applications: rows });
});

app.post("/api/applications", async (c) => {
  const user = c.get("user")!;
  const parsed = await parseJson(c, ApplicationInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  if (d.unit_id != null) {
    const unit = await get(
      "SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?",
      [d.unit_id, user.id],
    );
    if (!unit) return c.json({ error: "Unit not found or access denied" }, 404);
  }
  const result = await run(
    `INSERT INTO applications (user_id, unit_id, first_name, last_name, email, phone, monthly_income, employer, desired_move_in, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      d.unit_id ?? null, d.first_name, d.last_name,
      d.email ?? null, d.phone ?? null, d.monthly_income ?? null, d.employer ?? null,
      d.desired_move_in ?? null, d.status ?? "new", d.notes ?? null,
    ],
  );
  const row = await get(
    `SELECT a.*, u.name as unit_name, p.name as property_name
     FROM applications a LEFT JOIN units u ON u.id = a.unit_id LEFT JOIN properties p ON p.id = u.property_id
     WHERE a.id = ?`,
    [result.lastInsertRowid],
  );
  return c.json({ application: row }, 201);
});

app.put("/api/applications/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const parsed = await parseJson(c, ApplicationInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const existing = await get("SELECT id FROM applications WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (parsed.data.unit_id != null) {
    const unit = await get(
      "SELECT u.id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ? AND p.user_id = ?",
      [parsed.data.unit_id, user.id],
    );
    if (!unit) return c.json({ error: "Unit not found or access denied" }, 404);
  }
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id, user.id);
  const r = await run(`UPDATE applications SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(
    `SELECT a.*, u.name as unit_name, p.name as property_name
     FROM applications a LEFT JOIN units u ON u.id = a.unit_id LEFT JOIN properties p ON p.id = u.property_id
     WHERE a.id = ?`,
    [id],
  );
  return c.json({ application: row });
});

app.delete("/api/applications/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const user = c.get("user")!;
  const r = await run("DELETE FROM applications WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Dashboard summary ──────────────────────────────────────────────

app.get("/api/dashboard/summary", async (c) => {
  const user = c.get("user")!;
  const today = new Date().toISOString().slice(0, 10);
  const periodNow = today.slice(0, 7);

  const dashboardGet = <T,>(sql: string, params: unknown[] = [], fallback: T) =>
    get<T>(sql, params).then((v) => v ?? fallback);

  const [
    propertyCount,
    unitCount,
    occupiedCount,
    vacantCount,
    activeLeases,
    upcomingMoveOuts,
    monthOutstanding,
    monthCollected,
    monthCredited,
    monthSettled,
    overdueRow,
    openWorkOrders,
    urgentWorkOrders,
    recentWorkOrders,
    upcomingExpirations,
    monthlyTrends,
    portfolioDistribution,
  ] = await Promise.all([
    dashboardGet<{ n: number }>("SELECT COUNT(*) as n FROM properties WHERE user_id = ?", [user.id], { n: 0 }),
    dashboardGet<{ n: number }>("SELECT COUNT(*) as n FROM units u JOIN properties p ON p.id = u.property_id WHERE p.user_id = ?", [user.id], { n: 0 }),
    dashboardGet<{ n: number }>("SELECT COUNT(*) as n FROM units u JOIN properties p ON p.id = u.property_id WHERE p.user_id = ? AND u.status = 'occupied'", [user.id], { n: 0 }),
    dashboardGet<{ n: number }>("SELECT COUNT(*) as n FROM units u JOIN properties p ON p.id = u.property_id WHERE p.user_id = ? AND u.status = 'vacant'", [user.id], { n: 0 }),
    dashboardGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE p.user_id = ? AND l.status = 'active'",
      [user.id],
      { n: 0 },
    ),
    dashboardGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE p.user_id = ? AND l.status = 'active' AND l.end_date <= date('now', '+30 days')",
      [user.id],
      { n: 0 },
    ),
    dashboardGet<{ total: number }>(
      `SELECT COALESCE(SUM(c.amount - c.amount_paid - c.amount_credited), 0) as total
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ? AND c.period = ? AND c.status != 'waived'`,
      [user.id, periodNow],
      { total: 0 },
    ),
    dashboardGet<{ total: number }>(
      `SELECT COALESCE(SUM(payment.amount), 0) as total
       FROM payments payment
       JOIN rent_charges c ON c.id = payment.charge_id
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ? AND substr(payment.paid_at, 1, 7) = ?`,
      [user.id, periodNow],
      { total: 0 },
    ),
    dashboardGet<{ total: number }>(
      `SELECT COALESCE(SUM(c.amount_credited), 0) as total
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ? AND c.period = ?`,
      [user.id, periodNow],
      { total: 0 },
    ),
    dashboardGet<{ total: number }>(
      `SELECT COALESCE(SUM(c.amount_paid + c.amount_credited), 0) as total
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ? AND c.period = ? AND c.status != 'waived'`,
      [user.id, periodNow],
      { total: 0 },
    ),
    dashboardGet<{ total: number; n: number }>(
      `SELECT COALESCE(SUM(c.amount - c.amount_paid - c.amount_credited), 0) as total, COUNT(*) as n
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ? AND c.due_date < date('now') AND c.amount_paid + c.amount_credited < c.amount AND c.status != 'waived'`,
      [user.id],
      { total: 0, n: 0 },
    ),
    dashboardGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM work_orders w
       JOIN properties p ON p.id = w.property_id
       WHERE p.user_id = ? AND w.status NOT IN ('completed', 'cancelled')`,
      [user.id],
      { n: 0 },
    ),
    dashboardGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM work_orders w
       JOIN properties p ON p.id = w.property_id
       WHERE p.user_id = ? AND w.priority = 'urgent' AND w.status NOT IN ('completed', 'cancelled')`,
      [user.id],
      { n: 0 },
    ),
    query<{ id: number; title: string; priority: string; status: string; property_name: string | null; unit_name: string | null; created_at: string }>(
      `SELECT w.id, w.title, w.priority, w.status, p.name as property_name, u.name as unit_name, w.created_at
       FROM work_orders w
       JOIN properties p ON p.id = w.property_id
       LEFT JOIN units u ON u.id = w.unit_id
       WHERE p.user_id = ? AND w.status NOT IN ('completed', 'cancelled')
       ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.created_at DESC
       LIMIT 6`,
      [user.id],
    ),
    query<{ id: number; end_date: string; tenant_first_name: string | null; tenant_last_name: string | null; unit_name: string | null; property_name: string | null }>(
      `SELECT l.id, l.end_date,
         t.first_name as tenant_first_name, t.last_name as tenant_last_name,
         u.name as unit_name, p.name as property_name
       FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = l.primary_tenant_id
       WHERE p.user_id = ? AND l.status = 'active' AND l.end_date <= date('now', '+60 days')
       ORDER BY l.end_date ASC LIMIT 6`,
      [user.id],
    ),
    query<{ period: string; charged: number; collected: number }>(
      `SELECT c.period,
              COALESCE(SUM(c.amount), 0) as charged,
              COALESCE(SUM(c.amount_paid), 0) as collected
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.user_id = ? AND c.period >= strftime('%Y-%m', date('now', '-5 months'))
         AND c.status != 'waived'
       GROUP BY c.period
       ORDER BY c.period ASC
       `,
      [user.id],
    ),
    query<{ id: number; name: string; color: string; total_units: number; occupied_units: number }>(
      `SELECT p.id, p.name, p.color,
              COUNT(u.id) as total_units,
              COALESCE(SUM(CASE WHEN u.status = 'occupied' THEN 1 ELSE 0 END), 0) as occupied_units
       FROM properties p
      LEFT JOIN units u ON u.property_id = p.id
       WHERE p.user_id = ?
       GROUP BY p.id
       ORDER BY total_units DESC
       LIMIT 5`,
      [user.id],
    ),
  ]);

  return c.json({
    period: periodNow,
    properties: propertyCount.n,
    units: unitCount.n,
    occupied: occupiedCount.n,
    vacant: vacantCount.n,
    occupancy_rate: unitCount.n ? Math.round((occupiedCount.n / unitCount.n) * 100) : 0,
    active_leases: activeLeases.n,
    upcoming_move_outs: upcomingMoveOuts.n,
    month_outstanding: monthOutstanding.total,
    month_collected: monthCollected.total,
    month_credited: monthCredited.total,
    month_settled: monthSettled.total,
    overdue_total: overdueRow.total,
    overdue_count: overdueRow.n,
    open_work_orders: openWorkOrders.n,
    urgent_work_orders: urgentWorkOrders.n,
    recent_work_orders: recentWorkOrders,
    upcoming_expirations: upcomingExpirations,
    monthly_trends: monthlyTrends,
    portfolio_distribution: portfolioDistribution,
  });
});

// ── Financial Reports ──────────────────────────────────────────────

app.get("/api/reports/rent-roll", async (c) => {
  const user = c.get("user")!;
  const period = c.req.query("period") || new Date().toISOString().slice(0, 7);

  const charges = await query<{
    id: number;
    period: string;
    due_date: string;
    amount: number;
    amount_paid: number;
    amount_credited: number;
    status: string;
    unit_id: number;
    unit_name: string;
    property_id: number;
    property_name: string;
    tenant_name: string | null;
    tenant_phone: string | null;
  }>(
    `SELECT c.id, c.period, c.due_date, c.amount, c.amount_paid, c.amount_credited, c.status,
       u.id as unit_id, u.name as unit_name,
       p.id as property_id, p.name as property_name,
       CASE WHEN t.first_name IS NOT NULL THEN (t.first_name || ' ' || t.last_name) ELSE NULL END as tenant_name,
       t.phone as tenant_phone
     FROM rent_charges c
     JOIN leases l ON l.id = c.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     WHERE p.user_id = ? AND c.period = ?
     ORDER BY p.name, u.name`,
    [user.id, period],
  );

  const billableCharges = charges.filter((r) => r.status !== "waived");
  const totalCharged = billableCharges.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalCollected = billableCharges.reduce((s, r) => s + (r.amount_paid ?? 0), 0);
  const totalCredited = billableCharges.reduce((s, r) => s + (r.amount_credited ?? 0), 0);
  const totalOutstanding = Math.max(0, totalCharged - totalCollected - totalCredited);
  const today = new Date().toISOString().slice(0, 10);
  const totalOverdue = charges
    .filter((r) => r.status === "overdue" || (r.due_date < today && r.amount_paid + r.amount_credited < r.amount))
    .reduce((s, r) => s + (r.amount - r.amount_paid - r.amount_credited), 0);

  return c.json({
    period,
    totals: {
      charged: totalCharged,
      collected: totalCollected,
      credited: totalCredited,
      outstanding: totalOutstanding,
      overdue: totalOverdue,
      count: charges.length,
    },
    charges,
  });
});

app.get("/api/reports/arrears", async (c) => {
  const user = c.get("user")!;
  const rows = await query<{
    id: number;
    period: string;
    due_date: string;
    amount: number;
    amount_paid: number;
    amount_credited: number;
    status: string;
    property_name: string;
    unit_name: string;
    tenant_name: string | null;
    tenant_phone: string | null;
    tenant_email: string | null;
  }>(
    `SELECT c.id, c.period, c.due_date, c.amount, c.amount_paid, c.amount_credited, c.status,
       p.name as property_name, u.name as unit_name,
       CASE WHEN t.first_name IS NOT NULL THEN (t.first_name || ' ' || t.last_name) ELSE NULL END as tenant_name,
       t.phone as tenant_phone, t.email as tenant_email
     FROM rent_charges c
     JOIN leases l ON l.id = c.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     WHERE p.user_id = ? AND c.amount_paid + c.amount_credited < c.amount AND c.status != 'waived' AND c.due_date < date('now')
     ORDER BY c.due_date ASC`,
    [user.id],
  );

  const today = new Date();
  const arrears = rows.map((r) => {
    const balance = r.amount - r.amount_paid - r.amount_credited;
    const dueDate = new Date(r.due_date);
    const daysOverdue = Math.max(0, Math.round((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));
    return { ...r, balance, days_overdue: daysOverdue };
  });

  const totalOverdue = arrears.reduce((s, a) => s + a.balance, 0);

  return c.json({
    total_overdue: totalOverdue,
    count: arrears.length,
    arrears,
  });
});

app.get("/api/reports/payments", async (c) => {
  const user = c.get("user")!;
  const period = c.req.query("period");
  const where: string[] = ["pr.user_id = ?"];
  const params: unknown[] = [user.id];
  if (period) {
    where.push("substr(p.paid_at, 1, 7) = ?");
    params.push(period);
  }

  const whereClause = "WHERE " + where.join(" AND ");

  const rows = await query<{
    id: number;
    paid_at: string;
    amount: number;
    applied_amount: number;
    method: string;
    reference: string | null;
    notes: string | null;
    charge_period: string;
    property_name: string;
    unit_name: string;
    tenant_name: string | null;
  }>(
    `SELECT p.id, p.paid_at, p.amount, p.applied_amount, p.method, p.reference, p.notes,
       c.period as charge_period,
       pr.name as property_name, u.name as unit_name,
       CASE WHEN t.first_name IS NOT NULL THEN (t.first_name || ' ' || t.last_name) ELSE NULL END as tenant_name
     FROM payments p
     JOIN rent_charges c ON c.id = p.charge_id
     JOIN leases l ON l.id = c.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties pr ON pr.id = u.property_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     ${whereClause}
     ORDER BY p.paid_at DESC LIMIT 500`,
    params,
  );

  const totalCollected = rows.reduce((s, r) => s + r.amount, 0);
  return c.json({ total_collected: totalCollected, count: rows.length, payments: rows });
});

// ── Demo Requests (Lead Generation) ────────────────────────────────

const DemoRequestInput = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  units: z.number().int().min(1).optional().default(5),
  portfolio_type: z.string().optional().default("residential"),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

app.post("/api/demo-requests", async (c) => {
  const parsed = await parseJson(c, DemoRequestInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO demo_requests (name, email, phone, units, portfolio_type, location, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.name, d.email, d.phone, d.units, d.portfolio_type, d.location ?? null, d.notes ?? null],
  );
  return c.json({
    ok: true,
    message: "Your demo request has been saved.",
    id: result.lastInsertRowid,
  }, 201);
});

// ── Settings (key/value) ───────────────────────────────────────────

app.get("/api/settings", async (c) => {
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  // Defaults first, so a caller always gets a currency and a due day even if
  // the seed has not run yet (a brand-new database, or a deleted row).
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return c.json({ settings: out });
});

app.put("/api/settings", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object") return c.json({ error: "Body must be an object" }, 400);
  const entries = Object.entries(body as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null);
  for (const [key, value] of entries) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, String(value)],
    );
  }
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return c.json({ settings: out });
});

// ── Developer Debugging ────────────────────────────────────────────

app.post("/api/developer/switch-plan", async (c) => {
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");
  let token = "";
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
  else if (cookieHeader) {
    const match = cookieHeader.match(/koditrack_session=([^;]+)/);
    if (match) token = match[1];
  }
  const user = token ? await getSessionUser(token) : null;
  if (!user || (user.email.toLowerCase() !== "jamesbriandungu@gmail.com" && user.role !== "admin")) {
    return c.json({ error: "Only developer (jamesbriandungu@gmail.com) can switch debug plans" }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan;
  if (typeof plan !== "string" || !isPaidPlan(plan)) {
    return c.json({ error: "Invalid plan. Choose a paid plan." }, 400);
  }

  await run("UPDATE users SET plan = ? WHERE id = ?", [plan, user.id]);
  const updatedUser = await get<User>(
    "SELECT id, email, name, phone, role, COALESCE(plan, 'free') as plan, plan_expires_at, created_at FROM users WHERE id = ?",
    [user.id]
  );
  return c.json({ ok: true, user: updatedUser, message: `Developer switched plan to ${plan.toUpperCase()}` });
});

// ── Safaricom Daraja M-Pesa Integration (Phase D) ───────────────────

const StkPushInput = z.object({
  phone: z.string().min(9),
  amount: z.number().int().positive(),
  purpose: z.enum(["subscription", "rent"]),
  plan: z.enum(["starter", "plus", "manager"]).optional(),
  charge_id: z.number().int().optional(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

const SUBSCRIPTION_PRICES_KES: Record<PaidPlanId, number> = {
  starter: PAID_PLANS.starter.priceKes,
  plus: PAID_PLANS.plus.priceKes,
  manager: PAID_PLANS.manager.priceKes,
};

app.post("/api/mpesa/stkpush", async (c) => {
  const parsed = await parseJson(c, StkPushInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const data = parsed.data;

  // Retrieve user if authenticated
  const authHeader = c.req.header("Authorization");
  const cookieHeader = c.req.header("Cookie");
  let token = "";
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
  else if (cookieHeader) {
    const match = cookieHeader.match(/koditrack_session=([^;]+)/);
    if (match) token = match[1];
  }
  const user = token ? await getSessionUser(token) : null;

  if (data.purpose === "subscription") {
    if (!data.plan) return c.json({ error: "Choose a subscription plan." }, 400);
    if (data.amount !== SUBSCRIPTION_PRICES_KES[data.plan]) {
      return c.json({ error: "The amount does not match the selected plan price." }, 400);
    }
    if (!user && (!data.name || !data.email || !data.password)) {
      return c.json({ error: "Name, email, and password are required to create an account." }, 400);
    }
    if (!user && data.email) {
      const existing = await get("SELECT id FROM users WHERE email = ?", [data.email.toLowerCase().trim()]);
      if (existing) return c.json({ error: "An account with this email already exists. Sign in before upgrading." }, 409);
    }
  } else {
    if (!user) return c.json({ error: "Sign in before requesting a rent payment." }, 401);
    if (!data.charge_id) return c.json({ error: "A rent charge is required." }, 400);
    const charge = await get(
      `SELECT c.id
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE c.id = ? AND p.user_id = ?`,
      [data.charge_id, user.id],
    );
    if (!charge) return c.json({ error: "Charge not found or access denied." }, 404);
  }

  const allowSimulation = isPaymentSimulationAllowed(c.env);
  const darajaConfig = getDarajaConfig(c.env, c.req.url);

  const accountRef = data.purpose === "subscription" ? `PLAN_${(data.plan || "starter").toUpperCase()}` : `RENT_${data.charge_id}`;
  const desc = data.purpose === "subscription" ? `KodiTrack ${data.plan}` : "Rent Payment";

  let stkResult: StkPushResult;
  try {
    stkResult = await initiateStkPush(
      {
        phone: data.phone,
        amount: data.amount,
        accountReference: accountRef,
        transactionDesc: desc,
      },
      darajaConfig,
      allowSimulation,
    );
  } catch (error) {
    if (error instanceof Error) return c.json({ error: error.message }, 502);
    throw error;
  }

  let metadataObj: Record<string, unknown> = {};
  if (data.name) metadataObj.name = data.name;
  if (data.email) metadataObj.email = data.email;
  if (data.password) {
    const { hash, salt } = await hashPassword(data.password);
    metadataObj.password_hash = hash;
    metadataObj.salt = salt;
  }
  if (data.charge_id) metadataObj.charge_id = data.charge_id;

  const refId = data.purpose === "subscription" ? (data.plan ?? "starter") : String(data.charge_id ?? "");
  const pollToken = crypto.randomUUID();
  metadataObj.poll_token_hash = await hashPaymentPollToken(pollToken);

  await run(
    `INSERT INTO mpesa_transactions (
      checkout_request_id, merchant_request_id, user_id, phone, amount, purpose, reference_id, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      stkResult.checkoutRequestId,
      stkResult.merchantRequestId,
      user?.id ?? null,
      normalizeKenyanPhone(data.phone),
      data.amount,
      data.purpose,
      refId,
      JSON.stringify(metadataObj),
    ]
  );

  return c.json({
    ok: true,
    checkout_request_id: stkResult.checkoutRequestId,
    merchant_request_id: stkResult.merchantRequestId,
    customer_message: stkResult.customerMessage,
    simulated: stkResult.simulated ?? false,
    poll_token: pollToken,
    plan: data.plan,
  });
});

app.post("/api/mpesa/callback", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = parseDarajaCallback(body);

  if (!parsed.checkoutRequestId) {
    return c.json({ ResultCode: 1, ResultDesc: "Missing CheckoutRequestID" });
  }

  const tx = await get<{
    id: number;
    user_id: number | null;
    purpose: string;
    reference_id: string;
    amount: number;
    phone: string;
    status: string;
    metadata: string | null;
  }>("SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?", [parsed.checkoutRequestId]);

  if (!tx) {
    return c.json({ ResultCode: 1, ResultDesc: "Transaction not found" });
  }

  if (tx.status !== "pending") {
    return c.json({ ResultCode: 0, ResultDesc: "Callback already processed" });
  }

  let verifiedResult: Awaited<ReturnType<typeof queryStkPush>>;
  try {
    verifiedResult = await queryStkPush(parsed.checkoutRequestId, getDarajaConfig(c.env, c.req.url));
  } catch (error) {
    console.error("Unable to verify Daraja callback", error);
    return c.json({ ResultCode: 1, ResultDesc: "Unable to verify callback with Daraja" }, 502);
  }
  if (verifiedResult.resultCode !== parsed.resultCode) {
    return c.json({ ResultCode: 1, ResultDesc: "Callback result does not match Daraja status" }, 409);
  }
  if (
    parsed.success &&
    (!parsed.mpesaReceipt ||
      parsed.amount !== tx.amount ||
      normalizeKenyanPhone(parsed.phone || "") !== tx.phone)
  ) {
    return c.json({ ResultCode: 1, ResultDesc: "Callback payment details do not match the transaction" }, 400);
  }

  if (parsed.success) {
    if (tx.purpose === "rent" && tx.reference_id) {
      const chargeId = parseInt(tx.reference_id, 10);
      if (!Number.isFinite(chargeId)) {
        return c.json({ ResultCode: 1, ResultDesc: "Invalid rent charge reference" }, 400);
      }
      const ownedCharge = await get(
        `SELECT c.id FROM rent_charges c
         JOIN leases l ON l.id = c.lease_id
         JOIN units u ON u.id = l.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE c.id = ? AND p.user_id = ?`,
        [chargeId, tx.user_id],
      );
      if (!ownedCharge) {
        return c.json({ ResultCode: 1, ResultDesc: "Rent charge ownership no longer matches the payment" }, 409);
      }
      try {
        const recorded = await recordRentReceipt({
          chargeId,
          amount: parsed.amount!,
          method: "mpesa",
          reference: parsed.mpesaReceipt!,
          notes: "Safaricom Daraja STK Push",
        });
        if (!recorded) return c.json({ ResultCode: 1, ResultDesc: "Rent charge no longer exists" }, 409);
      } catch (error) {
        console.error("Unable to record verified rent payment", error);
        return c.json({ ResultCode: 1, ResultDesc: "Unable to record rent payment" }, 500);
      }
    }

    const transition = await run(
      "UPDATE mpesa_transactions SET status = 'completed', mpesa_receipt = ?, result_desc = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
      [parsed.mpesaReceipt, parsed.resultDesc, tx.id]
    );
    if (!transition.changes) return c.json({ ResultCode: 0, ResultDesc: "Callback already processed" });

    if (tx.purpose === "subscription") {
      const plan = tx.reference_id || "starter";
      if (tx.user_id) {
        await run(
          `UPDATE users SET plan = ?,
             plan_expires_at = datetime(
               CASE WHEN plan_expires_at > datetime('now') THEN plan_expires_at ELSE datetime('now') END,
               '+1 month'
             )
           WHERE id = ?`,
          [plan, tx.user_id],
        );
      } else if (tx.metadata) {
        try {
          const meta = JSON.parse(tx.metadata);
          if (meta.email && meta.password_hash && meta.salt) {
            const res = await run(
              "INSERT OR IGNORE INTO users (email, password_hash, salt, name, phone, role, plan, plan_expires_at) VALUES (?, ?, ?, ?, ?, 'landlord', ?, datetime('now', '+1 month'))",
              [meta.email.toLowerCase().trim(), meta.password_hash, meta.salt, meta.name || "Landlord", tx.phone, plan]
            );
            if (res.lastInsertRowid) {
              await run("UPDATE mpesa_transactions SET user_id = ? WHERE id = ?", [res.lastInsertRowid, tx.id]);
            }
          }
        } catch {}
      }
    }
  } else {
    await run(
      "UPDATE mpesa_transactions SET status = 'failed', result_desc = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
      [parsed.resultDesc, tx.id]
    );
  }

  return c.json({ ResultCode: 0, ResultDesc: "Callback accepted" });
});

app.get("/api/mpesa/query/:checkoutRequestId", async (c) => {
  const checkoutRequestId = c.req.param("checkoutRequestId");
  const tx = await get<{
    id: number;
    checkout_request_id: string;
    status: string;
    mpesa_receipt: string | null;
    result_desc: string | null;
    purpose: string;
    reference_id: string;
    user_id: number | null;
    metadata: string | null;
    amount: number;
    phone: string;
  }>("SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?", [checkoutRequestId]);

  if (!tx) return c.json({ error: "Transaction not found" }, 404);

  const metadata = tx.metadata ? JSON.parse(tx.metadata) as { poll_token_hash?: string } : {};
  const suppliedPollToken = c.req.header("X-Payment-Token");
  const hasValidPollToken =
    !!suppliedPollToken &&
    !!metadata.poll_token_hash &&
    (await hashPaymentPollToken(suppliedPollToken)) === metadata.poll_token_hash;
  const isOwner = c.get("user")?.id === tx.user_id;
  if (!hasValidPollToken && !isOwner) return c.json({ error: "Transaction not found" }, 404);

  const simulate = c.req.query("simulate") === "true";
  if (simulate && !isPaymentSimulationAllowed(c.env)) {
    return c.json({ error: "Payment simulation is disabled." }, 403);
  }
  if (simulate && tx.status === "pending") {
    const fakeReceipt = "QKH" + Math.floor(100000 + Math.random() * 900000);
    await run(
      "UPDATE mpesa_transactions SET status = 'completed', mpesa_receipt = ?, result_desc = 'The service request is processed successfully.', updated_at = datetime('now') WHERE id = ?",
      [fakeReceipt, tx.id]
    );

    let sessionToken = "";
    let activatedUser: User | null = null;

    if (tx.purpose === "subscription") {
      const plan = tx.reference_id || "starter";
      if (tx.user_id) {
        await run(
          `UPDATE users SET plan = ?,
             plan_expires_at = datetime(
               CASE WHEN plan_expires_at > datetime('now') THEN plan_expires_at ELSE datetime('now') END,
               '+1 month'
             )
           WHERE id = ?`,
          [plan, tx.user_id],
        );
        activatedUser = (await get<User>("SELECT id, email, name, phone, role, plan, plan_expires_at, created_at FROM users WHERE id = ?", [tx.user_id])) || null;
        sessionToken = await createSession(tx.user_id);
      } else if (tx.metadata) {
        try {
          const meta = JSON.parse(tx.metadata);
          if (meta.email && meta.password_hash && meta.salt) {
            let existing = await get<{ id: number }>("SELECT id FROM users WHERE email = ?", [meta.email.toLowerCase().trim()]);
            let uid = existing?.id;
            if (!uid) {
              const res = await run(
                "INSERT INTO users (email, password_hash, salt, name, phone, role, plan, plan_expires_at) VALUES (?, ?, ?, ?, ?, 'landlord', ?, datetime('now', '+1 month'))",
                [meta.email.toLowerCase().trim(), meta.password_hash, meta.salt, meta.name || "Landlord", tx.phone || null, plan]
              );
              uid = res.lastInsertRowid;
            } else {
              await run(
                `UPDATE users SET plan = ?,
                   plan_expires_at = datetime(
                     CASE WHEN plan_expires_at > datetime('now') THEN plan_expires_at ELSE datetime('now') END,
                     '+1 month'
                   )
                 WHERE id = ?`,
                [plan, uid],
              );
            }
            await run("UPDATE mpesa_transactions SET user_id = ? WHERE id = ?", [uid, tx.id]);
            sessionToken = await createSession(uid);
            activatedUser = (await get<User>("SELECT id, email, name, phone, role, plan, plan_expires_at, created_at FROM users WHERE id = ?", [uid])) || null;
          }
        } catch {}
      }
    } else if (tx.purpose === "rent" && tx.reference_id) {
      const chargeId = parseInt(tx.reference_id, 10);
      if (Number.isFinite(chargeId)) {
        const ownedCharge = await get(
          `SELECT c.id FROM rent_charges c
           JOIN leases l ON l.id = c.lease_id
           JOIN units u ON u.id = l.unit_id
           JOIN properties p ON p.id = u.property_id
           WHERE c.id = ? AND p.user_id = ?`,
          [chargeId, tx.user_id],
        );
        if (!ownedCharge) return c.json({ error: "Rent charge ownership no longer matches the payment." }, 409);
        await recordRentReceipt({
          chargeId,
          amount: tx.amount,
          method: "mpesa",
          reference: fakeReceipt,
          notes: "Development payment simulation",
        });
      }
    }

    if (sessionToken) {
      c.header("Set-Cookie", `koditrack_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`);
    }

    return c.json({
      status: "completed",
      mpesa_receipt: fakeReceipt,
      message: "Payment successfully confirmed via M-Pesa.",
      plan: tx.reference_id,
      user: activatedUser,
      token: sessionToken || undefined,
    });
  }

  let token = "";
  let user: User | null = null;
  if (tx.status === "completed" && tx.user_id) {
    user = (await get<User>("SELECT id, email, name, phone, role, plan, plan_expires_at, created_at FROM users WHERE id = ?", [tx.user_id])) || null;
    token = await createSession(tx.user_id);
    c.header("Set-Cookie", `koditrack_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`);
  }

  return c.json({
    status: tx.status,
    mpesa_receipt: tx.mpesa_receipt,
    result_desc: tx.result_desc,
    plan: tx.reference_id,
    user,
    token: token || undefined,
  });
});

// ── Health ─────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ ok: true }));

app.notFound(async (c) => {
  if (c.req.path === "/api" || c.req.path.startsWith("/api/")) {
    return c.json({ error: "Not found" }, 404);
  }
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.text("Not found", 404);
  }
  if (!c.req.header("Accept")?.includes("text/html")) {
    return c.text("Not found", 404);
  }

  return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), c.req.raw));
});

export default app;
