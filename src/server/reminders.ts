// Late-rent reminders: what is due today, drafted, and the log of what was sent.
//
// A person sends each reminder from their own mail and marks it sent here, so
// the next step comes when it falls due and nothing is sent twice. The draft
// is ready for an agent to rewrite (in the tenant's language, say), and the
// log's sent_by and channel are there so an agent can take the sending over
// later; today nothing here sends anything.

import type { Hono } from "hono";
import { z } from "zod";
import { get, query, run } from "./db";
import { intParam, parseJson, type Env } from "./http";
import { pendingPaymentsByLease, releaseOrphanedMatches, reviewCount } from "./bank";
import { dueReminders, readReminderSteps, renderReminder, type ReminderCharge } from "../shared/reminders";

const today = () => new Date().toISOString().slice(0, 10);

interface ChargeRow extends ReminderCharge {
  lease_id: number;
  tenant_id: number | null;
  email: string | null;
  phone: string | null;
}

async function settings(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings").catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function computeDue(day: string) {
  const s = await settings();
  const grace = Number.isFinite(parseFloat(s.late_fee_grace_days)) ? parseFloat(s.late_fee_grace_days) : 5;
  const currency = s.currency || "USD";
  const steps = readReminderSteps(s.reminder_steps, grace);
  const [charges, log] = await Promise.all([
    query<ChargeRow>(
      `SELECT c.id, c.lease_id, c.period, c.due_date, c.amount, c.amount_paid, c.status,
              t.id AS tenant_id, t.first_name, t.last_name, t.email, t.phone,
              u.name AS unit_name, p.name AS property_name, COALESCE(l.late_fee, 0) AS late_fee
       FROM rent_charges c
       JOIN leases l ON l.id = c.lease_id
       LEFT JOIN tenants t ON t.id = l.primary_tenant_id
       LEFT JOIN units u ON u.id = l.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
       WHERE c.status NOT IN ('paid', 'waived') AND c.amount_paid < c.amount - 0.004`,
    ),
    query<{ charge_id: number; step: string }>("SELECT charge_id, step FROM rent_reminders"),
  ]);
  const due = dueReminders(charges, steps, log, day);
  return { steps, currency, charges, due };
}

const ReminderInput = z.object({
  charge_id: z.number().int(),
  step: z.string().min(1).max(40),
  status: z.enum(["sent", "skipped"]).optional(),
  channel: z.enum(["email", "sms", "letter", "phone", "other"]).optional(),
  sent_by: z.enum(["person", "agent"]).optional(),
  recipient: z.string().max(200).nullable().optional(),
  subject: z.string().max(300).nullable().optional(),
  body: z.string().max(10000).nullable().optional(),
});

export function registerReminderRoutes(app: Hono<Env>) {
  // What is due today, each with its draft. `?today=YYYY-MM-DD` evaluates another day.
  app.get("/api/reminders", async (c) => {
    const q = c.req.query("today");
    const day = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today();
    await releaseOrphanedMatches();
    const [{ steps, currency, charges, due }, pending, sent] = await Promise.all([
      computeDue(day),
      pendingPaymentsByLease(),
      query(
        `SELECT r.id, r.charge_id, r.step, r.status, r.channel, r.sent_by, r.recipient, r.subject, r.created_at,
                c.period, t.first_name, t.last_name, u.name AS unit_name, p.name AS property_name
         FROM rent_reminders r
         JOIN rent_charges c ON c.id = r.charge_id
         JOIN leases l ON l.id = c.lease_id
         LEFT JOIN tenants t ON t.id = l.primary_tenant_id
         LEFT JOIN units u ON u.id = l.unit_id
         LEFT JOIN properties p ON p.id = u.property_id
         ORDER BY r.created_at DESC, r.id DESC LIMIT 50`,
      ),
    ]);
    const byId = new Map(charges.map((ch) => [ch.id, ch]));
    return c.json({
      today: day,
      steps,
      due: due.map((d) => {
        const ch = byId.get(d.charge_id)!;
        return {
          charge_id: ch.id,
          lease_id: ch.lease_id,
          period: ch.period,
          due_date: ch.due_date,
          amount: ch.amount,
          balance: d.balance,
          days_late: d.days_late,
          step: { key: d.step.key, label: d.step.label },
          tenant: { id: ch.tenant_id, name: [ch.first_name, ch.last_name].filter(Boolean).join(" ") || null, email: ch.email, phone: ch.phone },
          property_name: ch.property_name,
          unit_name: ch.unit_name,
          draft: { to: ch.email, ...renderReminder(d.step, ch, { currency, today: day }) },
          // A payment that looks like theirs is waiting in Bank matching: check before sending.
          pending_payment: pending.get(ch.lease_id) ?? null,
        };
      }),
      sent,
    });
  });

  // Mark a reminder sent (or skipped). The next step comes when it falls due.
  app.post("/api/reminders", async (c) => {
    const parsed = await parseJson(c, ReminderInput);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const d = parsed.data;
    const charge = await get("SELECT id FROM rent_charges WHERE id = ?", [d.charge_id]);
    if (!charge) return c.json({ error: "Charge not found" }, 404);
    const r = await run(
      `INSERT INTO rent_reminders (charge_id, step, status, channel, sent_by, recipient, subject, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(charge_id, step) DO NOTHING`,
      [d.charge_id, d.step, d.status ?? "sent", d.channel ?? "email", d.sent_by ?? "person", d.recipient ?? null, d.subject ?? null, d.body ?? null],
    );
    if (!r.changes) return c.json({ error: "This reminder is already marked" }, 409);
    return c.json({ id: r.lastInsertRowid }, 201);
  });

  // Undo a mark: the step is offered again.
  app.delete("/api/reminders/:id", async (c) => {
    const id = intParam(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    const r = await run("DELETE FROM rent_reminders WHERE id = ?", [id]);
    if (!r.changes) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // The counts the Rent tabs and the sidebar badge show.
  app.get("/api/rent/attention", async (c) => {
    await releaseOrphanedMatches();
    const [bank_review, { due }] = await Promise.all([reviewCount(), computeDue(today())]);
    return c.json({ bank_review, reminders_due: due.length });
  });
}
