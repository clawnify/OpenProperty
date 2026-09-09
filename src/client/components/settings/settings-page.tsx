import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/context";
import { cn, colorClasses } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Vendor, VendorCategory } from "@/types";
import { PageShell } from "@/components/page-shell";

const COLORS = ["sky", "emerald", "amber", "rose", "violet", "fuchsia", "teal", "orange", "slate"];

const VENDOR_CATEGORIES: { value: VendorCategory; label: string }[] = [
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
  { value: "hvac", label: "HVAC" },
  { value: "handyman", label: "Handyman" },
  { value: "cleaning", label: "Cleaning" },
  { value: "landscaping", label: "Landscaping" },
  { value: "general", label: "General" },
];

export function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      meta="Vendors and rent policy defaults"
      width="max-w-5xl"
    >

        <Tabs defaultValue="vendors">
          <TabsList>
            <TabsTrigger value="vendors">Vendors</TabsTrigger>
            <TabsTrigger value="policy">Rent policy</TabsTrigger>
          </TabsList>

          <TabsContent value="vendors" className="mt-4">
            <VendorsTab />
          </TabsContent>
          <TabsContent value="policy" className="mt-4">
            <PolicyTab />
          </TabsContent>
        </Tabs>
    </PageShell>
  );
}

// ── Vendors ────────────────────────────────────────────────────────

function VendorsTab() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | undefined>(undefined);

  return (
    <Card>
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-sm font-semibold">Vendors</h2>
          <p className="text-xs text-muted-foreground">Plumbers, electricians, handymen, and other service providers.</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Add vendor
        </Button>
      </div>
      {app.vendors.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No vendors yet.</div>
      ) : (
        <ul className="divide-y">
          {app.vendors.map((v) => {
            const palette = colorClasses(v.color);
            return (
              <li key={v.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className={cn("h-2.5 w-2.5 rounded-full", palette.dot)} />
                  <div>
                    <div className="font-medium">{v.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[v.phone, v.email].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" className="capitalize">{v.category}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(v); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <VendorDialog open={open} onOpenChange={setOpen} vendor={editing} />
    </Card>
  );
}

function VendorDialog({
  open, onOpenChange, vendor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendor?: Vendor;
}) {
  const app = useApp();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<VendorCategory>("general");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [color, setColor] = useState("slate");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(vendor?.name ?? "");
    setCategory(vendor?.category ?? "general");
    setPhone(vendor?.phone ?? "");
    setEmail(vendor?.email ?? "");
    setColor(vendor?.color ?? "slate");
    setNotes(vendor?.notes ?? "");
  }, [open, vendor]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        phone: phone.trim() || null,
        email: email.trim() || null,
        color,
        notes: notes.trim() || null,
      };
      if (vendor) await app.updateVendor(vendor.id, payload);
      else await app.createVendor(payload);
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!vendor) return;
    try {
      await app.deleteVendor(vendor.id);
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit vendor" : "New vendor"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="v-name">Name</Label>
            <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as VendorCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Color</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full bg-${c}-500`} />
                        <span className="capitalize">{c}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="v-phone">Phone</Label>
              <Input id="v-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="v-email">Email</Label>
              <Input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="v-notes">Notes</Label>
            <Textarea id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          {vendor && (
            <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirming(true)}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !name.trim()}>
            {vendor ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {vendor ? (
        <ConfirmDelete
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete ${vendor.name}?`}
          description="Work orders already assigned to them keep the name on record."
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}

// ── Policy ─────────────────────────────────────────────────────────

function PolicyTab() {
  const app = useApp();
  const [dueDay, setDueDay] = useState(String(app.settings.default_rent_due_day));
  const [lateFee, setLateFee] = useState(String(app.settings.late_fee_amount));
  const [grace, setGrace] = useState(String(app.settings.late_fee_grace_days));
  const [currency, setCurrency] = useState(app.settings.currency);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDueDay(String(app.settings.default_rent_due_day));
    setLateFee(String(app.settings.late_fee_amount));
    setGrace(String(app.settings.late_fee_grace_days));
    setCurrency(app.settings.currency);
  }, [app.settings]);

  async function save() {
    setSaving(true);
    try {
      await app.updateSettings({
        default_rent_due_day: Math.min(31, Math.max(1, parseInt(dueDay, 10) || 1)),
        late_fee_amount: parseFloat(lateFee) || 0,
        late_fee_grace_days: Math.max(0, parseInt(grace, 10) || 0),
        currency: currency.trim().toUpperCase() || "USD",
      });
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-sm font-semibold">Rent policy defaults</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Used when creating new leases. Each lease can override these.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="s-day">Rent due day</Label>
          <Input id="s-day" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-late">Late fee</Label>
          <Input id="s-late" type="number" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-grace">Grace days</Label>
          <Input id="s-grace" type="number" min={0} value={grace} onChange={(e) => setGrace(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-cur">Currency</Label>
          <Input id="s-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" />
        </div>
      </div>
      <div className="mt-4">
        <Button onClick={save} disabled={saving}>Save settings</Button>
      </div>
    </Card>
  );
}
