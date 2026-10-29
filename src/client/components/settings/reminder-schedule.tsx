import { useEffect, useState } from "react";
import { useApp } from "@/context";
import { api } from "@/api";
import { toIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultReminderSteps, PLACEHOLDERS, readReminderSteps, renderReminder, type ReminderStep } from "@shared/reminders";

// A made-up charge, to show what each draft will read like on the day it falls due.
const SAMPLE = {
  id: 0, period: "", due_date: "", amount: 1650, amount_paid: 0, status: "overdue",
  first_name: "Marcus", last_name: "Reed", unit_name: "101", property_name: "Riverside Lofts", late_fee: 50,
};

/** The late-rent schedule: when each reminder falls due, and its wording. */
export function ReminderSchedule() {
  const app = useApp();
  const grace = app.settings.late_fee_grace_days;
  const [steps, setSteps] = useState<ReminderStep[]>(() => defaultReminderSteps(grace));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ settings: Record<string, string> }>("GET", "/api/settings")
      .then((r) => setSteps(readReminderSteps(r.settings.reminder_steps, grace)))
      .catch((err) => app.setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grace]);

  const update = (key: string, patch: Partial<ReminderStep>) => {
    setSaved(false);
    setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  async function save() {
    setSaving(true);
    try {
      const value = JSON.stringify(steps.map(({ key, days_after_due, enabled, subject, body }) => ({ key, days_after_due, enabled, subject, body })));
      await api("PUT", "/api/settings", { reminder_steps: value });
      setSaved(true);
      void app.refreshAttention();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dueDate = `${toIsoDate(new Date()).slice(0, 7)}-01`;
  const dayOf = (s: ReminderStep) => {
    const d = new Date(`${dueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + s.days_after_due);
    return d.toISOString().slice(0, 10);
  };
  return (
    <div className="grid gap-4">
      <Card className="p-6">
        <h2 className="mb-1 text-sm font-semibold">Late-rent reminders</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          On the day a step falls due, Rent → Reminders lists it with the email written. You send it from your own mail and
          mark it sent. Only the furthest step reached is offered, and nothing is offered once the rent is paid. Words in
          braces are filled in for each tenant: {PLACEHOLDERS.map((p) => `{${p}}`).join(", ")}.
        </p>
      </Card>

      {steps.map((s) => {
        const sample = renderReminder(s, { ...SAMPLE, period: dueDate.slice(0, 7), due_date: dueDate }, {
          currency: app.settings.currency,
          today: dayOf(s),
        });
        return (
          <Card key={s.key} className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={s.enabled}
                  onChange={(e) => update(s.key, { enabled: e.target.checked })}
                />
                {s.label}
              </label>
              <div className="flex items-center gap-2 text-sm">
                <Input
                  type="number"
                  className="h-8 w-20"
                  value={Math.abs(s.days_after_due)}
                  min={0}
                  aria-label={`${s.label}: days`}
                  onChange={(e) => {
                    const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                    update(s.key, { days_after_due: s.key === "before_due" ? -n : n });
                  }}
                />
                <span className="text-muted-foreground">{s.key === "before_due" ? "days before the due date" : "days after the due date"}</span>
              </div>
            </div>
            {s.enabled ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <div>
                    <Label htmlFor={`rs-${s.key}-subject`}>Subject</Label>
                    <Input id={`rs-${s.key}-subject`} value={s.subject} onChange={(e) => update(s.key, { subject: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor={`rs-${s.key}-body`}>Message</Label>
                    <Textarea id={`rs-${s.key}-body`} rows={9} value={s.body} onChange={(e) => update(s.key, { body: e.target.value })} />
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <div className="section-label mb-1">Reads like</div>
                  <div className="font-medium">{sample.subject}</div>
                  <p className="mt-2 whitespace-pre-line text-muted-foreground">{sample.body}</p>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>Save reminders</Button>
        <Button variant="ghost" onClick={() => { setSaved(false); setSteps(defaultReminderSteps(grace)); }}>
          Restore the standard wording
        </Button>
        {saved ? <span className="text-sm text-muted-foreground" role="status">Saved.</span> : null}
      </div>
    </div>
  );
}
