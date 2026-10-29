import { useEffect, useState } from "react";
import { BellRing, ChevronDown, ChevronRight, Mail } from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, formatDate, formatExact, formatMoney, formatPeriod } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/page-shell";
import { RentTabs } from "./rent-tabs";
import type { DueReminderItem, SentReminder } from "@/types";

const STEP_TONE: Record<string, string> = {
  before_due: "bg-info-tint text-info",
  late: "bg-warning-tint text-warning",
  final: "bg-destructive-tint text-destructive",
};

const STEP_LABEL: Record<string, string> = { before_due: "Reminder", late: "Late notice", final: "Final notice" };

function mailto(to: string, subject: string, body: string) {
  // The address stays readable: some mail apps do not decode %40 in it.
  const address = encodeURIComponent(to.trim()).replace(/%40/g, "@");
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Late-rent reminders due today, each drafted. The person sends it from their
 * own mail ("Open in email" fills it in) and marks it sent; the next step
 * comes when it falls due, and a matched payment stops the sequence.
 */
export function RemindersPage({ navigate }: { navigate: (to: string) => void }) {
  const app = useApp();
  const [due, setDue] = useState<DueReminderItem[]>([]);
  const [sent, setSent] = useState<SentReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { subject: string; body: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function load() {
    try {
      setLoading(true);
      const r = await api<{ due: DueReminderItem[]; sent: SentReminder[] }>("GET", "/api/reminders");
      setDue(r.due);
      setSent(r.sent);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const draftOf = (d: DueReminderItem) => drafts[d.charge_id] ?? { subject: d.draft.subject, body: d.draft.body };

  async function mark(d: DueReminderItem, status: "sent" | "skipped") {
    setBusy(d.charge_id);
    const draft = draftOf(d);
    try {
      await api("POST", "/api/reminders", {
        charge_id: d.charge_id,
        step: d.step.key,
        status,
        channel: "email",
        sent_by: "person",
        recipient: d.tenant.email,
        subject: status === "sent" ? draft.subject : null,
        body: status === "sent" ? draft.body : null,
      });
      setOpen(null);
      await load();
      void app.refreshAttention();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function undo(s: SentReminder) {
    try {
      await api("DELETE", `/api/reminders/${s.id}`);
      await load();
      void app.refreshAttention();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  async function copy(d: DueReminderItem) {
    const draft = draftOf(d);
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      setCopied(d.charge_id);
      setTimeout(() => setCopied((c) => (c === d.charge_id ? null : c)), 2000);
    } catch {
      // Clipboard access can be blocked inside the dashboard frame: the draft
      // is open and selectable instead.
      setOpen(d.charge_id);
    }
  }

  return (
    <PageShell
      title="Reminders"
      meta={loading ? undefined : due.length ? `${due.length} due today` : "Nothing due today"}
      actions={
        <Button variant="secondary" onClick={() => navigate("/settings?tab=reminders")}>
          Schedule and wording
        </Button>
      }
    >
      <RentTabs active="reminders" navigate={navigate} />

      {loading ? (
        <Card className="divide-y divide-border overflow-hidden" role="status" aria-label="Loading reminders">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-14 items-center gap-4 px-4" aria-hidden>
              <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-2.5 w-40 animate-pulse rounded-full bg-muted" />
              <div className="ml-auto h-2.5 w-20 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </Card>
      ) : !due.length ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
          <BellRing className="size-7 text-faint" aria-hidden />
          <p className="font-medium">No reminders due today</p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            When rent is still unpaid after the grace period, the notice to send appears here, already written. Once the
            payment is matched, nothing more is sent.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[1.0625rem] font-semibold">Due today <span className="font-normal text-muted-foreground">· {due.length}</span></h2>
          </div>
          <ul className="divide-y divide-border">
            {due.map((d) => {
              const draft = draftOf(d);
              const expanded = open === d.charge_id;
              return (
                <li key={d.charge_id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : d.charge_id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} the draft for ${d.tenant.name ?? "this tenant"}`}
                    >
                      {expanded ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                      <span className={cn("shrink-0 rounded-full px-2 text-xs font-medium leading-5", STEP_TONE[d.step.key] ?? "bg-muted text-muted-foreground")}>
                        {d.step.label}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{d.tenant.name ?? "No tenant on the lease"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {d.property_name} · {d.unit_name} · {formatPeriod(d.period)}
                        </span>
                      </span>
                    </button>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">{formatMoney(d.balance, app.settings.currency)}</div>
                      <div className={cn("text-xs", d.days_late > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {d.days_late > 0 ? `${d.days_late} days late` : d.days_late === 0 ? "due today" : `due in ${-d.days_late} days`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {d.tenant.email ? (
                        <Button size="sm" variant="secondary" asChild>
                          <a href={mailto(d.tenant.email, draft.subject, draft.body)} target="_blank" rel="noopener noreferrer">
                            <Mail className="size-4" /> Open in email
                          </a>
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" disabled={busy === d.charge_id} onClick={() => mark(d, "sent")}>
                        Mark sent
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === d.charge_id} onClick={() => mark(d, "skipped")}>
                        Skip
                      </Button>
                    </div>
                  </div>

                  {d.pending_payment ? (
                    <p className="mt-2 text-sm text-warning">
                      A {formatExact(d.pending_payment.amount, app.settings.currency)} payment from {formatDate(d.pending_payment.booked_on)} may
                      be this tenant's.{" "}
                      <button type="button" className="underline underline-offset-2" onClick={() => navigate("/rent/bank")}>
                        Check Bank matching
                      </button>{" "}
                      before sending.
                    </p>
                  ) : null}
                  {!d.tenant.email ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No email on file{d.tenant.phone ? `; phone ${d.tenant.phone}` : ""}.{" "}
                      {d.tenant.id ? (
                        <button type="button" className="underline underline-offset-2" onClick={() => navigate(`/tenants/${d.tenant.id}`)}>
                          Add one on the tenant's page
                        </button>
                      ) : null}
                    </p>
                  ) : null}

                  {expanded ? (
                    <div className="mt-3 grid gap-2 rounded-md bg-muted/40 p-3">
                      <div>
                        <Label htmlFor={`subject-${d.charge_id}`}>Subject</Label>
                        <Input
                          id={`subject-${d.charge_id}`}
                          value={draft.subject}
                          onChange={(e) => setDrafts({ ...drafts, [d.charge_id]: { ...draft, subject: e.target.value } })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`body-${d.charge_id}`}>Message</Label>
                        <Textarea
                          id={`body-${d.charge_id}`}
                          rows={8}
                          value={draft.body}
                          onChange={(e) => setDrafts({ ...drafts, [d.charge_id]: { ...draft, body: e.target.value } })}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Changes here go into this email and its record. The standard wording is in Settings.
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => copy(d)}>
                          {copied === d.charge_id ? "Copied" : "Copy text"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {sent.length ? (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[1.0625rem] font-semibold">Sent recently</h2>
          </div>
          <ul className="divide-y divide-border">
            {sent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatDate(s.created_at)}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{[s.first_name, s.last_name].filter(Boolean).join(" ") || "Tenant"}</span>
                  <span className="text-muted-foreground"> · {STEP_LABEL[s.step] ?? s.step} for {formatPeriod(s.period)}</span>
                </span>
                <span className="rounded-full bg-muted px-2 text-xs leading-5">
                  {s.status === "skipped" ? "Skipped" : s.sent_by === "agent" ? "Sent by the agent" : "Sent"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => undo(s)} aria-label={`Undo: offer this ${STEP_LABEL[s.step] ?? s.step} again`}>
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PageShell>
  );
}
