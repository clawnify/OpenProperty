// Bank matching: imported statement lines, matched to the rent they pay.
//
// The browser reads the statement file (CSV or CAMT.053) and posts the
// normalised lines; an agent can post the same shape. Only money in is kept.
// A line seen in an earlier, overlapping statement is skipped. A payer a
// person confirmed before, paying exactly what the lease owes, is recorded on
// import; everything else waits in "To review" with a suggestion, computed
// fresh on every read so it follows charges generated since.

import type { Hono } from "hono";
import { z } from "zod";
import { get, query, run } from "./db";
import { intParam, parseJson, type Env } from "./http";
import { allocate, payerKey, payOrder, periodHint, propose, type Allocation, type MatchCharge, type MatchContext, type Proposal } from "../shared/matching";
import { normalizeAccount, normalizeName, normalizeText } from "../shared/text";

const round2 = (n: number) => Math.round(n * 100) / 100;
const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** D1 binds at most 100 parameters per statement; run `fn` over `items` in chunks that fit. */
async function chunked<T>(items: T[], perItem: number, fn: (chunk: T[]) => Promise<void>) {
  const size = Math.max(1, Math.floor(99 / perItem));
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

export interface TxRow {
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
  matched_by: string | null;
  note: string | null;
}

interface LeaseRow {
  id: number;
  status: string;
  monthly_rent: number;
  unit_name: string | null;
  property_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface BankContext extends MatchContext {
  leaseRows: Map<number, LeaseRow>;
}

/** Everything matching reads: leases with their tenants, open charges, known payers. */
export async function loadContext(): Promise<BankContext> {
  const [leases, coTenants, charges, payers] = await Promise.all([
    query<LeaseRow>(
      `SELECT l.id, l.status, l.monthly_rent, u.name AS unit_name, p.name AS property_name, t.first_name, t.last_name
       FROM leases l
       LEFT JOIN units u ON u.id = l.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
       LEFT JOIN tenants t ON t.id = l.primary_tenant_id`,
    ),
    query<{ lease_id: number; first_name: string; last_name: string }>(
      `SELECT lt.lease_id, t.first_name, t.last_name FROM lease_tenants lt JOIN tenants t ON t.id = lt.tenant_id`,
    ).catch(() => []),
    query<{ id: number; lease_id: number; period: string; due_date: string; amount: number; amount_paid: number }>(
      `SELECT id, lease_id, period, due_date, amount, amount_paid FROM rent_charges
       WHERE status != 'waived' AND amount_paid < amount - 0.004`,
    ),
    query<{ lease_id: number; payer_account: string | null; payer_name: string | null }>(
      "SELECT lease_id, payer_account, payer_name FROM bank_payers",
    ),
  ]);
  const open: MatchCharge[] = charges.map((c) => ({
    id: c.id,
    lease_id: c.lease_id,
    period: c.period,
    due_date: c.due_date,
    balance: round2(c.amount - c.amount_paid),
  }));
  const owing = new Set(open.map((c) => c.lease_id));
  // Current leases, and past ones that still owe: arrears can be paid after a move-out.
  const relevant = leases.filter((l) => l.status === "active" || l.status === "upcoming" || owing.has(l.id));
  return {
    charges: open,
    payers,
    leases: relevant.map((l) => ({
      id: l.id,
      unit_name: l.unit_name,
      tenant_names: [
        [l.first_name, l.last_name].filter(Boolean).join(" "),
        ...coTenants.filter((t) => t.lease_id === l.id).map((t) => `${t.first_name} ${t.last_name}`),
      ].filter(Boolean),
    })),
    leaseRows: new Map(leases.map((l) => [l.id, l])),
  };
}

function leaseLabel(l: LeaseRow | undefined) {
  if (!l) return null;
  return {
    lease_id: l.id,
    property_name: l.property_name,
    unit_name: l.unit_name,
    tenant_name: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
  };
}

/** A proposal with the names a person needs to judge it. */
function describe(p: Proposal, ctx: BankContext) {
  const charge = (id: number) => ctx.charges.find((c) => c.id === id);
  return {
    kind: p.kind,
    lease: p.lease_id ? leaseLabel(ctx.leaseRows.get(p.lease_id)) : null,
    allocations: p.allocations.map((a) => ({ ...a, period: charge(a.charge_id)?.period ?? null })),
    unapplied: p.unapplied,
    evidence: p.evidence,
    candidates: p.candidates
      .filter((id) => id !== p.lease_id)
      .map((id) => ({
        ...leaseLabel(ctx.leaseRows.get(id)),
        owing: round2(ctx.charges.filter((c) => c.lease_id === id).reduce((s, c) => s + c.balance, 0)),
      })),
  };
}

/** Payments whose bank transaction no longer exists, or the reverse, after a
 *  charge, lease or payment was deleted elsewhere in the app. */
export async function releaseOrphanedMatches() {
  await run("DELETE FROM bank_matches WHERE payment_id NOT IN (SELECT id FROM payments)");
  await run(
    `UPDATE bank_transactions SET status = 'review', lease_id = NULL, matched_by = NULL
     WHERE status = 'matched' AND id NOT IN (SELECT transaction_id FROM bank_matches)`,
  );
}

/** The same recalculation the ledger does after a payment, for many charges at once. */
export async function recomputeCharges(ids: number[]) {
  const unique = [...new Set(ids)];
  const paid = "(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.charge_id = rent_charges.id)";
  await chunked(unique, 1, async (chunk) => {
    await run(
      `UPDATE rent_charges SET
         amount_paid = ${paid},
         status = CASE
           WHEN status = 'waived' THEN 'waived'
           WHEN ${paid} >= amount - 0.004 THEN 'paid'
           WHEN ${paid} > 0 THEN 'partial'
           WHEN due_date < date('now') THEN 'overdue'
           ELSE 'open'
         END
       WHERE id IN (${marks(chunk.length)})`,
      chunk,
    );
  });
}

async function rememberPayer(leaseId: number, tx: Pick<TxRow, "payer_name" | "payer_account" | "reference">) {
  const key = payerKey(tx);
  if (!key) return;
  const existing = key.payer_account
    ? await get("SELECT id FROM bank_payers WHERE lease_id = ? AND payer_account = ?", [leaseId, key.payer_account])
    : await get("SELECT id FROM bank_payers WHERE lease_id = ? AND payer_account IS NULL AND payer_name = ?", [leaseId, key.payer_name]);
  if (existing) return;
  await run("INSERT INTO bank_payers (lease_id, payer_account, payer_name) VALUES (?, ?, ?)", [leaseId, key.payer_account, key.payer_name]);
}

/**
 * Records a bank transaction as payments on a lease's charges. The status
 * change is claimed first, so two clicks (or a person and an agent) cannot
 * record the same money twice; any failure puts everything back.
 */
async function applyMatch(
  tx: TxRow,
  leaseId: number,
  allocations: Allocation[],
  by: "auto" | "person" | "agent",
  remember: boolean,
): Promise<{ ok: true } | { ok: false; status: 400 | 409; error: string }> {
  const claim = await run(
    "UPDATE bank_transactions SET status = 'matched', lease_id = ?, matched_by = ? WHERE id = ? AND status = 'review'",
    [leaseId, by, tx.id],
  );
  if (!claim.changes) return { ok: false, status: 409, error: "This payment is no longer waiting for a match" };
  const inserted: number[] = [];
  try {
    if (!allocations.length) throw new Error("Nothing to record: this lease has no open charge. Generate its charges first.");
    const ids = allocations.map((a) => a.charge_id);
    const charges = await query<{ id: number; lease_id: number; amount: number; amount_paid: number; status: string }>(
      `SELECT id, lease_id, amount, amount_paid, status FROM rent_charges WHERE id IN (${marks(ids.length)})`,
      ids,
    );
    let total = 0;
    for (const a of allocations) {
      const c = charges.find((x) => x.id === a.charge_id);
      if (!c || c.lease_id !== leaseId) throw new Error("A charge does not belong to this lease");
      if (c.status === "waived") throw new Error("A charge is waived");
      if (!(a.amount > 0) || a.amount > round2(c.amount - c.amount_paid) + 0.004) throw new Error("More than a charge still owes");
      total += a.amount;
    }
    if (round2(total) > round2(tx.amount) + 0.004) throw new Error("More than the payment");
    const reference = (tx.reference ?? tx.bank_ref ?? "").slice(0, 140) || null;
    const notes = by === "auto" ? "Matched automatically from a bank statement" : "Matched from a bank statement";
    for (const a of allocations) {
      const rows = await query<{ id: number }>(
        `INSERT INTO payments (charge_id, paid_at, amount, method, reference, notes) VALUES (?, ?, ?, 'ach', ?, ?) RETURNING id`,
        [a.charge_id, tx.booked_on, a.amount, reference, notes],
      );
      if (!rows[0]) throw new Error("The payment was not recorded");
      inserted.push(rows[0].id);
    }
    await run(`INSERT INTO bank_matches (transaction_id, payment_id) VALUES ${inserted.map(() => "(?, ?)").join(", ")}`, inserted.flatMap((id) => [tx.id, id]));
    await recomputeCharges(ids);
    if (remember) await rememberPayer(leaseId, tx);
    return { ok: true };
  } catch (err) {
    if (inserted.length) {
      await run(`DELETE FROM bank_matches WHERE payment_id IN (${marks(inserted.length)})`, inserted);
      await run(`DELETE FROM payments WHERE id IN (${marks(inserted.length)})`, inserted);
      await recomputeCharges(allocations.map((a) => a.charge_id));
    }
    await run("UPDATE bank_transactions SET status = 'review', lease_id = NULL, matched_by = NULL WHERE id = ?", [tx.id]);
    return { ok: false, status: 400, error: (err as Error).message };
  }
}

// About seven queries a match; this keeps a request well inside the 1,000 a
// Worker may run. Anything past it stays in review, and "Match again" picks it up.
const AUTO_MATCH_LIMIT = 100;

/** Records every transaction whose proposal is automatic. Returns how many. */
async function autoMatch(txs: TxRow[]): Promise<number> {
  if (!txs.length) return 0;
  const ctx = await loadContext();
  let matched = 0;
  for (const tx of txs) {
    if (matched >= AUTO_MATCH_LIMIT) break;
    const p = propose(tx, ctx);
    if (p.kind !== "auto" || !p.lease_id) continue;
    const r = await applyMatch(tx, p.lease_id, p.allocations, "auto", false);
    if (!r.ok) continue;
    matched++;
    // A second payment in the same statement must not pay the same charge again.
    for (const a of p.allocations) {
      const c = ctx.charges.find((x) => x.id === a.charge_id);
      if (c) c.balance = round2(c.balance - a.amount);
    }
    ctx.charges = ctx.charges.filter((c) => c.balance > 0.004);
  }
  return matched;
}

const Line = z.object({
  booked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "booked_on must be YYYY-MM-DD"),
  amount: z.number().finite(),
  currency: z.string().max(3).nullable().optional(),
  payer_name: z.string().max(200).nullable().optional(),
  payer_account: z.string().max(64).nullable().optional(),
  reference: z.string().max(1000).nullable().optional(),
  bank_ref: z.string().max(140).nullable().optional(),
});

const ImportInput = z.object({
  filename: z.string().max(200).nullable().optional(),
  format: z.enum(["csv", "camt053", "api"]).optional(),
  // A Worker request may run 1,000 queries; a bigger statement goes in several posts.
  lines: z.array(Line).max(500),
});

const MatchInput = z.object({
  lease_id: z.number().int(),
  /** Omitted: the server applies the payment oldest charge first (the named month first). */
  allocations: z.array(z.object({ charge_id: z.number().int(), amount: z.number().positive() })).max(24).optional(),
  /** Remember this payer for the lease, so next month's payment is matched on import. Default true. */
  remember: z.boolean().optional(),
  by: z.enum(["person", "agent"]).optional(),
});

const TX_COLUMNS = "id, import_id, booked_on, amount, currency, payer_name, payer_account, reference, bank_ref, status, lease_id, matched_by, note";

export function registerBankRoutes(app: Hono<Env>) {
  // Import statement lines. Money out and lines already imported are skipped.
  app.post("/api/bank/imports", async (c) => {
    const parsed = await parseJson(c, ImportInput);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const { filename, format, lines } = parsed.data;

    // A line's identity: the bank's own reference when it gives one (unique per
    // entry, so a repeat is the same payment), else its content. Two identical
    // lines without a bank reference are two payments, and stay two on re-import.
    const seen = new Map<string, number>();
    let repeatedInFile = 0;
    const credits = lines
      .filter((l) => l.amount > 0.004)
      .flatMap((l) => {
        const account = normalizeAccount(l.payer_account);
        const base = l.bank_ref
          ? `ref:${l.bank_ref}`
          : [l.booked_on, l.amount.toFixed(2), account ?? "", normalizeName(l.payer_name), normalizeText(l.reference)].join("|");
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        if (l.bank_ref && n > 1) {
          repeatedInFile++;
          return [];
        }
        return [{ ...l, amount: round2(l.amount), payer_account: account, fingerprint: n > 1 ? `${base}#${n}` : base }];
      });

    const existing = new Set<string>();
    await chunked(credits, 1, async (chunk) => {
      const rows = await query<{ fingerprint: string }>(
        `SELECT fingerprint FROM bank_transactions WHERE fingerprint IN (${marks(chunk.length)})`,
        chunk.map((r) => r.fingerprint),
      );
      rows.forEach((r) => existing.add(r.fingerprint));
    });
    const fresh = credits.filter((r) => !existing.has(r.fingerprint));

    const duplicates = credits.length - fresh.length + repeatedInFile;
    const imp = await run("INSERT INTO bank_imports (filename, format, credits, duplicates) VALUES (?, ?, ?, ?)", [
      filename ?? null,
      format ?? "api",
      credits.length + repeatedInFile,
      duplicates,
    ]);
    const importId = imp.lastInsertRowid;
    await chunked(fresh, 10, async (chunk) => {
      await run(
        // OR IGNORE: the same statement imported twice at once skips the lines the other import wrote.
        `INSERT OR IGNORE INTO bank_transactions (import_id, booked_on, amount, currency, payer_name, payer_account, reference, bank_ref, fingerprint, status)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, 'review')").join(", ")}`,
        chunk.flatMap((r) => [importId, r.booked_on, r.amount, r.currency ?? null, r.payer_name ?? null, r.payer_account, r.reference ?? null, r.bank_ref ?? null, r.fingerprint]),
      );
    });
    const inserted = await query<TxRow>(`SELECT ${TX_COLUMNS} FROM bank_transactions WHERE import_id = ? ORDER BY booked_on, id`, [importId]);
    const autoMatched = await autoMatch(inserted);
    await run("UPDATE bank_imports SET auto_matched = ? WHERE id = ?", [autoMatched, importId]);
    return c.json(
      {
        import_id: importId,
        summary: {
          lines: lines.length,
          money_out_skipped: lines.length - credits.length - repeatedInFile,
          duplicates,
          imported: fresh.length,
          auto_matched: autoMatched,
          to_review: fresh.length - autoMatched,
        },
      },
      201,
    );
  });

  // The queue. `status`: review (default), matched or ignored.
  app.get("/api/bank/transactions", async (c) => {
    const status = c.req.query("status") ?? "review";
    if (!["review", "matched", "ignored"].includes(status)) return c.json({ error: "status must be review, matched or ignored" }, 400);
    // Pages stay under D1's 100 bound parameters for the lookups below.
    const limit = Math.min(90, Math.max(1, intParam(c.req.query("limit")) ?? 50));
    const offset = Math.max(0, intParam(c.req.query("offset")) ?? 0);
    await releaseOrphanedMatches();
    const [rows, counts] = await Promise.all([
      query<TxRow>(`SELECT ${TX_COLUMNS} FROM bank_transactions WHERE status = ? ORDER BY booked_on DESC, id DESC LIMIT ? OFFSET ?`, [status, limit, offset]),
      query<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM bank_transactions GROUP BY status"),
    ]);
    const countBy = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)]));
    let transactions: unknown[] = rows;
    if (status === "review") {
      const ctx = await loadContext();
      transactions = rows.map((tx) => ({ ...tx, proposal: describe(propose(tx, ctx), ctx) }));
    } else if (status === "matched" && rows.length) {
      const ids = rows.map((r) => r.id);
      const paid = await query<{ transaction_id: number; payment_id: number; amount: number; charge_id: number; period: string }>(
        `SELECT bm.transaction_id, p.id AS payment_id, p.amount, p.charge_id, rc.period
         FROM bank_matches bm JOIN payments p ON p.id = bm.payment_id JOIN rent_charges rc ON rc.id = p.charge_id
         WHERE bm.transaction_id IN (${marks(ids.length)})`,
        ids,
      );
      const leaseIds = [...new Set(rows.map((r) => r.lease_id).filter((x): x is number => x !== null))];
      const leases = new Map(
        (leaseIds.length
          ? await query<LeaseRow>(
              `SELECT l.id, l.status, l.monthly_rent, u.name AS unit_name, p.name AS property_name, t.first_name, t.last_name
               FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
               LEFT JOIN tenants t ON t.id = l.primary_tenant_id
               WHERE l.id IN (${marks(leaseIds.length)})`,
              leaseIds,
            )
          : []
        ).map((l) => [l.id, l]),
      );
      transactions = rows.map((tx) => {
        const payments = paid.filter((p) => p.transaction_id === tx.id);
        const applied = round2(payments.reduce((s, p) => s + p.amount, 0));
        return {
          ...tx,
          lease: leaseLabel(tx.lease_id ? leases.get(tx.lease_id) : undefined),
          payments: payments.map(({ payment_id, amount, charge_id, period }) => ({ payment_id, amount, charge_id, period })),
          unapplied: round2(tx.amount - applied),
        };
      });
    }
    return c.json({
      transactions,
      counts: { review: countBy.review ?? 0, matched: countBy.matched ?? 0, ignored: countBy.ignored ?? 0 },
    });
  });

  // Leases a payment can be assigned to, with what each still owes.
  app.get("/api/bank/leases", async (c) => {
    const ctx = await loadContext();
    const leases = ctx.leases.map((l) => {
      const open = ctx.charges.filter((ch) => ch.lease_id === l.id).sort((a, b) => a.due_date.localeCompare(b.due_date));
      return { ...leaseLabel(ctx.leaseRows.get(l.id)), open, owing: round2(open.reduce((s, ch) => s + ch.balance, 0)) };
    });
    leases.sort((a, b) => b.owing - a.owing || String(a.property_name).localeCompare(String(b.property_name)));
    return c.json({ leases });
  });

  // Record a transaction against a lease: confirming a suggestion, or assigning it by hand.
  app.post("/api/bank/transactions/:id/match", async (c) => {
    const id = intParam(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    const parsed = await parseJson(c, MatchInput);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const tx = await get<TxRow>(`SELECT ${TX_COLUMNS} FROM bank_transactions WHERE id = ?`, [id]);
    if (!tx) return c.json({ error: "Not found" }, 404);
    if (tx.status !== "review") return c.json({ error: "This payment is no longer waiting for a match" }, 409);
    const { lease_id, remember = true, by = "person" } = parsed.data;
    let allocations = parsed.data.allocations;
    if (!allocations) {
      const ctx = await loadContext();
      const ordered = payOrder(ctx.charges.filter((ch) => ch.lease_id === lease_id), periodHint(tx.reference, tx.booked_on));
      allocations = allocate(tx.amount, ordered).allocations;
    }
    const r = await applyMatch(tx, lease_id, allocations, by, remember);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    return c.json({ ok: true });
  });

  // Undo a match: its payments are removed and the charges recalculated. The
  // remembered payer stays unless `forget_payer` is set (a wrong automatic match).
  app.post("/api/bank/transactions/:id/unmatch", async (c) => {
    const id = intParam(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    const body = (await c.req.json().catch(() => ({}))) as { forget_payer?: boolean };
    const tx = await get<TxRow>(`SELECT ${TX_COLUMNS} FROM bank_transactions WHERE id = ?`, [id]);
    if (!tx) return c.json({ error: "Not found" }, 404);
    if (tx.status !== "matched") return c.json({ error: "This payment is not matched" }, 409);
    const payments = await query<{ id: number; charge_id: number }>(
      "SELECT p.id, p.charge_id FROM bank_matches bm JOIN payments p ON p.id = bm.payment_id WHERE bm.transaction_id = ?",
      [id],
    );
    await run("DELETE FROM bank_matches WHERE transaction_id = ?", [id]);
    if (payments.length) {
      await run(`DELETE FROM payments WHERE id IN (${marks(payments.length)})`, payments.map((p) => p.id));
      await recomputeCharges(payments.map((p) => p.charge_id));
    }
    if (body.forget_payer && tx.lease_id) {
      const key = payerKey(tx);
      if (key?.payer_account) await run("DELETE FROM bank_payers WHERE lease_id = ? AND payer_account = ?", [tx.lease_id, key.payer_account]);
      if (key?.payer_name) await run("DELETE FROM bank_payers WHERE lease_id = ? AND payer_name = ?", [tx.lease_id, key.payer_name]);
    }
    await run("UPDATE bank_transactions SET status = 'review', lease_id = NULL, matched_by = NULL WHERE id = ?", [id]);
    return c.json({ ok: true });
  });

  // Not rent (a refund, a deposit, a transfer between your own accounts): out of the queue.
  app.post("/api/bank/transactions/:id/ignore", async (c) => {
    const id = intParam(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    const body = (await c.req.json().catch(() => ({}))) as { note?: string };
    const r = await run("UPDATE bank_transactions SET status = 'ignored', note = ? WHERE id = ? AND status = 'review'", [
      typeof body.note === "string" ? body.note.slice(0, 500) : null,
      id,
    ]);
    if (!r.changes) return c.json({ error: "This payment is not waiting for a match" }, 409);
    return c.json({ ok: true });
  });

  app.post("/api/bank/transactions/:id/restore", async (c) => {
    const id = intParam(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    const r = await run("UPDATE bank_transactions SET status = 'review', note = NULL WHERE id = ? AND status = 'ignored'", [id]);
    if (!r.changes) return c.json({ error: "This payment is not ignored" }, 409);
    return c.json({ ok: true });
  });

  // Match again everything waiting: after this month's charges are generated,
  // payments that arrived first now have a charge to pay.
  app.post("/api/bank/rematch", async (c) => {
    const waiting = await query<TxRow>(`SELECT ${TX_COLUMNS} FROM bank_transactions WHERE status = 'review' ORDER BY booked_on, id`);
    return c.json({ auto_matched: await autoMatch(waiting) });
  });

  // Remembered payers: who pays for which lease.
  app.get("/api/bank/payers", async (c) => {
    const leaseId = intParam(c.req.query("lease_id"));
    const rows = leaseId
      ? await query("SELECT * FROM bank_payers WHERE lease_id = ? ORDER BY created_at", [leaseId])
      : await query("SELECT * FROM bank_payers ORDER BY lease_id, created_at");
    return c.json({ payers: rows });
  });

  app.delete("/api/bank/payers/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    const r = await run("DELETE FROM bank_payers WHERE id = ?", [id]);
    if (!r.changes) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });
}

/** For the Rent tab counts: payments waiting for a person. */
export async function reviewCount(): Promise<number> {
  const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM bank_transactions WHERE status = 'review'");
  return Number(row?.n ?? 0);
}

/** Which leases a waiting payment probably belongs to, so a late notice is not sent to someone who paid. */
export async function pendingPaymentsByLease(): Promise<Map<number, { transaction_id: number; amount: number; booked_on: string }>> {
  const waiting = await query<TxRow>(`SELECT ${TX_COLUMNS} FROM bank_transactions WHERE status = 'review' ORDER BY booked_on DESC`);
  const out = new Map<number, { transaction_id: number; amount: number; booked_on: string }>();
  if (!waiting.length) return out;
  const ctx = await loadContext();
  for (const tx of waiting) {
    const p = propose(tx, ctx);
    const leases = p.lease_id ? [p.lease_id] : [];
    for (const l of leases) if (!out.has(l)) out.set(l, { transaction_id: tx.id, amount: tx.amount, booked_on: tx.booked_on });
  }
  return out;
}
