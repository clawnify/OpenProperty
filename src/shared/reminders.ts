// The late-rent schedule: which reminder is due for which unpaid charge, and
// its draft. The app works out the step and writes the draft; a person sends
// it from their own mail and marks it sent. The log records who sent what and
// how, so an agent can take the sending over later without a new model.
//
// The default is firm rather than chatty, because that is how landlords who
// collect well run it: no nudge before the due date (it is there, switched
// off), a late notice the day after the grace period, and a final notice at
// 14 days. Formal legal notices are not drafted: they depend on the country.

export interface ReminderStep {
  key: string;
  label: string;
  /** Days after the due date the step falls due (negative: before it). */
  days_after_due: number;
  enabled: boolean;
  subject: string;
  body: string;
}

export interface ReminderCharge {
  id: number;
  period: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  status: string;
  first_name: string | null;
  last_name: string | null;
  unit_name: string | null;
  property_name: string | null;
  /** The lease's late fee, 0 for none. */
  late_fee: number;
}

export interface ReminderLog {
  charge_id: number;
  step: string;
}

export interface DueReminder {
  charge_id: number;
  step: ReminderStep;
  balance: number;
  /** Days past the due date (negative before it). */
  days_late: number;
}

export const PLACEHOLDERS = [
  "first_name", "full_name", "amount_due", "rent", "period", "due_date", "days_late", "property", "unit", "late_fee_line",
] as const;

export function defaultReminderSteps(graceDays: number): ReminderStep[] {
  return [
    {
      key: "before_due",
      label: "Reminder",
      days_after_due: -3,
      enabled: false,
      subject: "Rent for {period} is due on {due_date}",
      body:
        "Hi {first_name},\n\nA reminder that rent of {amount_due} for {property} · {unit} is due on {due_date}.\n\n" +
        "If you have already paid, thank you, and please ignore this message.\n\nKind regards",
    },
    {
      key: "late",
      label: "Late notice",
      days_after_due: Math.max(0, graceDays) + 1,
      enabled: true,
      subject: "Rent for {period} is overdue",
      body:
        "Hi {first_name},\n\nWe have not received your rent for {period}. {amount_due} for {property} · {unit} was due on " +
        "{due_date} and is now {days_late} days late.{late_fee_line}\n\nPlease pay as soon as you can, or reply to let us know when " +
        "you will. If you paid in the last few days, thank you, and please ignore this message.\n\nKind regards",
    },
    {
      key: "final",
      label: "Final notice",
      days_after_due: 14,
      enabled: true,
      subject: "Final notice: rent for {period} is {days_late} days overdue",
      body:
        "Hi {first_name},\n\nRent for {property} · {unit} is still unpaid: {amount_due} was due on {due_date}, {days_late} days ago." +
        "{late_fee_line}\n\nPlease pay in full within 7 days, or contact us today to agree a plan. If we do not hear from you, we " +
        "will take the formal steps your lease and the law provide for.\n\nKind regards",
    },
  ];
}

/** The saved schedule (JSON in settings) over the defaults; anything unreadable falls back to the defaults. */
export function readReminderSteps(raw: string | null | undefined, graceDays: number): ReminderStep[] {
  const defaults = defaultReminderSteps(graceDays);
  if (!raw) return defaults;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!Array.isArray(saved)) return defaults;
  return defaults.map((d) => {
    const s = saved.find((x): x is Partial<ReminderStep> => !!x && typeof x === "object" && (x as ReminderStep).key === d.key);
    if (!s) return d;
    return {
      ...d,
      days_after_due: Number.isFinite(Number(s.days_after_due)) ? Math.round(Number(s.days_after_due)) : d.days_after_due,
      enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
      subject: typeof s.subject === "string" && s.subject.trim() ? s.subject : d.subject,
      body: typeof s.body === "string" && s.body.trim() ? s.body : d.body,
    };
  });
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`): positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The one step due today for each unpaid charge: the furthest step reached
 * that nobody has sent or skipped. Earlier steps a person never got to are not
 * offered too, so a landlord who comes back after three weeks sends one final
 * notice, not three emails. Paid and waived charges have nothing due, which is
 * what stops the sequence the moment a payment is matched.
 */
export function dueReminders(charges: ReminderCharge[], steps: ReminderStep[], log: ReminderLog[], today: string): DueReminder[] {
  const enabled = steps.filter((s) => s.enabled).sort((a, b) => a.days_after_due - b.days_after_due);
  const logged = new Set(log.map((l) => `${l.charge_id}:${l.step}`));
  const out: DueReminder[] = [];
  for (const c of charges) {
    if (c.status === "waived" || c.status === "paid") continue;
    const balance = round2(c.amount - c.amount_paid);
    if (balance <= 0) continue;
    const daysLate = daysBetween(c.due_date, today);
    const reached = enabled.filter((s) => daysLate >= s.days_after_due);
    const step = reached[reached.length - 1];
    if (!step) continue;
    // Already handled: this step, or a later one sent by hand.
    if (steps.some((s) => s.days_after_due >= step.days_after_due && logged.has(`${c.id}:${s.key}`))) continue;
    out.push({ charge_id: c.id, step, balance, days_late: daysLate });
  }
  return out.sort((a, b) => b.days_late - a.days_late);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatPeriodLong(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : period;
}

export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}, ${y}` : iso;
}

export function formatAmount(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Fills a step's subject and body for one charge. Unknown `{words}` are left as written. */
export function renderReminder(
  step: Pick<ReminderStep, "subject" | "body">,
  charge: ReminderCharge,
  opts: { currency: string; today: string },
): { subject: string; body: string } {
  const balance = round2(charge.amount - charge.amount_paid);
  const vars: Record<string, string> = {
    first_name: charge.first_name?.trim() || "there",
    full_name: [charge.first_name, charge.last_name].filter(Boolean).join(" ") || "tenant",
    amount_due: formatAmount(balance, opts.currency),
    rent: formatAmount(charge.amount, opts.currency),
    period: formatPeriodLong(charge.period),
    due_date: formatDateLong(charge.due_date),
    days_late: String(Math.max(0, daysBetween(charge.due_date, opts.today))),
    property: charge.property_name ?? "",
    unit: charge.unit_name ?? "",
    late_fee_line: charge.late_fee > 0 ? ` A late fee of ${formatAmount(charge.late_fee, opts.currency)} applies under your lease.` : "",
  };
  const fill = (t: string) => t.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
  return { subject: fill(step.subject), body: fill(step.body) };
}
