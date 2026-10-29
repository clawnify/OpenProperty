import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite, r;
before(async () => {
  vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  r = await vite.ssrLoadModule("/src/shared/reminders.ts");
});
after(async () => { await vite?.close(); });

const charge = (o = {}) => ({
  id: 1, period: "2026-10", due_date: "2026-10-01", amount: 1650, amount_paid: 0, status: "overdue",
  first_name: "Marcus", last_name: "Reed", unit_name: "101", property_name: "Riverside Lofts", late_fee: 50, ...o,
});
const steps = (grace = 5) => r.defaultReminderSteps(grace);
const due = (charges, log, today, grace) => r.dueReminders(charges, steps(grace), log, today);

test("the default schedule: no nudge before the due date, a late notice after the grace period, a final notice at 14 days", () => {
  const s = steps(5);
  assert.deepEqual(s.map((x) => [x.key, x.days_after_due, x.enabled]), [["before_due", -3, false], ["late", 6, true], ["final", 14, true]]);
  assert.deepEqual(due([charge()], [], "2026-10-05"), [], "still inside the grace period");
  assert.deepEqual(due([charge()], [], "2026-10-07").map((d) => d.step.key), ["late"]);
  assert.deepEqual(due([charge()], [], "2026-10-15").map((d) => d.step.key), ["final"]);
});

test("a step sent is not offered again, and the next one comes when it falls due", () => {
  const log = [{ charge_id: 1, step: "late" }];
  assert.deepEqual(due([charge()], log, "2026-10-10"), []);
  assert.deepEqual(due([charge()], log, "2026-10-15").map((d) => d.step.key), ["final"]);
});

test("someone back after three weeks sends one final notice, not every step they missed", () => {
  const d = due([charge()], [], "2026-10-22");
  assert.equal(d.length, 1);
  assert.equal(d[0].step.key, "final");
  assert.equal(d[0].days_late, 21);
});

test("a final notice sent by hand early means the late notice is not offered after it", () => {
  assert.deepEqual(due([charge()], [{ charge_id: 1, step: "final" }], "2026-10-08"), []);
});

test("paid or waived charges have nothing due: matching the payment stops the sequence", () => {
  assert.deepEqual(due([charge({ amount_paid: 1650, status: "paid" })], [], "2026-10-20"), []);
  assert.deepEqual(due([charge({ status: "waived" })], [], "2026-10-20"), []);
  assert.equal(due([charge({ amount_paid: 900, status: "partial" })], [], "2026-10-20")[0].balance, 750);
});

test("the grace period moves the late notice", () => {
  assert.equal(steps(0).find((s) => s.key === "late").days_after_due, 1);
  assert.equal(due([charge()], [], "2026-10-02", 0)[0].step.key, "late");
});

test("a saved schedule overrides the defaults; anything unreadable falls back", () => {
  const saved = JSON.stringify([{ key: "before_due", enabled: true }, { key: "final", days_after_due: 21, subject: "Last call" }]);
  const s = r.readReminderSteps(saved, 5);
  assert.equal(s[0].enabled, true);
  assert.equal(s[2].days_after_due, 21);
  assert.equal(s[2].subject, "Last call");
  assert.equal(s[1].days_after_due, 6, "an unsaved step keeps its default");
  assert.deepEqual(r.readReminderSteps("{not json", 5), steps(5));
  assert.deepEqual(r.readReminderSteps(JSON.stringify({ key: "late" }), 5), steps(5));
});

test("the draft is filled from the lease: balance, dates, days late, the late fee only when there is one", () => {
  const late = steps(5)[1];
  const d = r.renderReminder(late, charge({ amount_paid: 650 }), { currency: "USD", today: "2026-10-07" });
  assert.equal(d.subject, "Rent for October 2026 is overdue");
  assert.match(d.body, /^Hi Marcus,/);
  assert.match(d.body, /\$1,000 for Riverside Lofts · 101 was due on October 1, 2026 and is now 6 days late\. A late fee of \$50 applies under your lease\./);
  const noFee = r.renderReminder(late, charge({ late_fee: 0 }), { currency: "EUR", today: "2026-10-07" });
  assert.doesNotMatch(noFee.body, /late fee/);
  assert.match(noFee.body, /€1,650/);
  assert.equal(r.renderReminder({ subject: "{unknown} {first_name}", body: "" }, charge(), { currency: "USD", today: "2026-10-07" }).subject, "{unknown} Marcus");
});
