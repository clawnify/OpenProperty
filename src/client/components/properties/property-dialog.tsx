import { useEffect, useState } from "react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Property, PropertyType } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: Property;
  onSaved?: (p: Property) => void;
}

const TYPES: { value: PropertyType; label: string }[] = [
  { value: "single_family", label: "Single-family home" },
  { value: "multi_family", label: "Multi-family / apartments" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "commercial", label: "Commercial" },
];

const COLORS = ["sky", "emerald", "amber", "rose", "violet", "fuchsia", "teal", "orange", "slate"];

export function PropertyDialog({ open, onOpenChange, property, onSaved }: Props) {
  const app = useApp();
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [type, setType] = useState<PropertyType>("single_family");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [zip, setZip] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [color, setColor] = useState("sky");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(property?.name ?? "");
    setType((property?.type as PropertyType) ?? "single_family");
    setAddress(property?.address ?? "");
    setCity(property?.city ?? "");
    setStateName(property?.state ?? "");
    setZip(property?.zip ?? "");
    setYearBuilt(property?.year_built ? String(property.year_built) : "");
    setColor(property?.color ?? "sky");
    setNotes(property?.notes ?? "");
  }, [open, property]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        address: address.trim() || null,
        city: city.trim() || null,
        state: stateName.trim() || null,
        zip: zip.trim() || null,
        year_built: yearBuilt ? parseInt(yearBuilt, 10) : null,
        color,
        notes: notes.trim() || null,
      };
      const saved = property
        ? await app.updateProperty(property.id, payload)
        : await app.createProperty(payload);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!property) return;
    try {
      await app.deleteProperty(property.id);
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{property ? "Edit property" : "New property"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="prop-name">Name</Label>
            <Input id="prop-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Oakwood Estate" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PropertyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
          <div>
            <Label htmlFor="prop-addr">Address</Label>
            <Input id="prop-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="prop-city">City</Label>
              <Input id="prop-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="prop-state">State</Label>
              <Input id="prop-state" value={stateName} onChange={(e) => setStateName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="prop-zip">Zip</Label>
              <Input id="prop-zip" value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="prop-year">Year built</Label>
            <Input id="prop-year" type="number" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="prop-notes">Notes</Label>
            <Textarea id="prop-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="mt-2">
          {property && (
            <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !name.trim()}>
            {property ? "Save changes" : "Create property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {property ? (
        <ConfirmDelete
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete "${property.name}"?`}
          description="Its units, leases, and rent history go with it. This cannot be undone."
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
