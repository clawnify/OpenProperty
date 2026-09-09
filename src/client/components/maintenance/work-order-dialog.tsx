import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Unit, WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder?: WorkOrder;
  defaults?: { property_id?: number; unit_id?: number };
  onSaved?: () => void;
}

const PRIORITIES: { value: WorkOrderPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUSES: { value: WorkOrderStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function WorkOrderDialog({ open, onOpenChange, workOrder, defaults, onSaved }: Props) {
  const app = useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [propertyId, setPropertyId] = useState<number | "">("");
  const [unitId, setUnitId] = useState<number | "">("");
  const [vendorId, setVendorId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkOrderPriority>("normal");
  const [status, setStatus] = useState<WorkOrderStatus>("open");
  const [scheduledAt, setScheduledAt] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const all = await app.listUnits();
        setUnits(all);
      } catch (err) {
        app.setError((err as Error).message);
      }
    })();
  }, [open, app]);

  useEffect(() => {
    if (!open) return;
    setPropertyId(workOrder?.property_id ?? defaults?.property_id ?? "");
    setUnitId(workOrder?.unit_id ?? defaults?.unit_id ?? "");
    setVendorId(workOrder?.vendor_id ?? "");
    setTitle(workOrder?.title ?? "");
    setDescription(workOrder?.description ?? "");
    setPriority(workOrder?.priority ?? "normal");
    setStatus(workOrder?.status ?? "open");
    setScheduledAt(workOrder?.scheduled_at?.slice(0, 10) ?? "");
    setCost(workOrder?.cost != null ? String(workOrder.cost) : "");
    setNotes(workOrder?.notes ?? "");
  }, [open, workOrder, defaults]);

  const filteredUnits = useMemo(() => {
    if (!propertyId) return units;
    return units.filter((u) => u.property_id === Number(propertyId));
  }, [units, propertyId]);

  // Auto-set property when picking a unit.
  useEffect(() => {
    if (!unitId) return;
    const u = units.find((x) => x.id === Number(unitId));
    if (u && propertyId !== u.property_id) setPropertyId(u.property_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        property_id: propertyId ? Number(propertyId) : null,
        unit_id: unitId ? Number(unitId) : null,
        vendor_id: vendorId ? Number(vendorId) : null,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        scheduled_at: scheduledAt || null,
        cost: cost ? parseFloat(cost) : null,
        notes: notes.trim() || null,
      };
      if (workOrder) {
        await app.updateWorkOrder(workOrder.id, payload);
      } else {
        await app.createWorkOrder(payload);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!workOrder) return;
    try {
      await app.deleteWorkOrder(workOrder.id);
      onSaved?.();
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
          <DialogTitle>{workOrder ? "Edit work order" : "New work order"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="wo-title">Title</Label>
            <Input id="wo-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leaking kitchen faucet" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Property</Label>
              <Select value={String(propertyId || "")} onValueChange={(v) => { setPropertyId(v ? Number(v) : ""); setUnitId(""); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {app.properties.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={String(unitId || "")} onValueChange={(v) => setUnitId(v ? Number(v) : "")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {filteredUnits.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="wo-desc">Description</Label>
            <Textarea id="wo-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as WorkOrderStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendor</Label>
              <Select value={String(vendorId || "")} onValueChange={(v) => setVendorId(v ? Number(v) : "")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {app.vendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wo-sched">Scheduled date</Label>
              <Input id="wo-sched" type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="wo-cost">Cost</Label>
              <Input id="wo-cost" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="wo-notes">Notes</Label>
            <Textarea id="wo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter className="mt-2">
          {workOrder && (
            <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !title.trim()}>
            {workOrder ? "Save changes" : "Create work order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this work order?"
        description="Its history and notes go with it. This cannot be undone."
        onConfirm={remove}
      />
    </>
  );
}
