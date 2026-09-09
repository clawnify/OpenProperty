import { useEffect, useState } from "react";
import { ArrowLeft, Building2, MapPin, Pencil, Plus, Wrench } from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, colorClasses, formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PropertyDialog } from "./property-dialog";
import { UnitDialog } from "./unit-dialog";
import { WorkOrderDialog } from "../maintenance/work-order-dialog";
import type { Property, Unit, WorkOrder } from "@/types";
import { PageShell } from "@/components/page-shell";

const TYPE_LABEL: Record<string, string> = {
  single_family: "Single-family",
  multi_family: "Multi-family",
  condo: "Condo",
  townhouse: "Townhouse",
  commercial: "Commercial",
};

const STATUS_TONE: Record<string, string> = {
  vacant: "bg-warning-tint text-warning",
  occupied: "bg-success-tint text-success",
  turnover: "bg-info-tint text-info",
  unavailable: "bg-muted text-muted-foreground",
};

export function PropertyPage({ id, navigate }: { id: number; navigate: (to: string) => void }) {
  const app = useApp();
  const [property, setProperty] = useState<Property | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProperty, setEditingProperty] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | undefined>(undefined);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [woDialogOpen, setWoDialogOpen] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [{ property: p }, ulist, wlist] = await Promise.all([
        api<{ property: Property }>("GET", `/api/properties/${id}`),
        app.listUnits(id),
        app.listWorkOrders({ property_id: id }),
      ]);
      setProperty(p);
      setUnits(ulist);
      setWorkOrders(wlist);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading property…
      </div>
    );
  }
  if (!property) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Property not found.</p>
        <Button variant="outline" onClick={() => navigate("/properties")}>Back to properties</Button>
      </div>
    );
  }

  const palette = colorClasses(property.color);
  const occupied = units.filter((u) => u.status === "occupied").length;
  const totalRent = units.reduce((sum, u) => sum + (u.market_rent ?? 0), 0);
  const openWorkOrders = workOrders.filter((w) => w.status !== "completed" && w.status !== "cancelled");

  return (
    <PageShell
      title={
        <button
          type="button"
          onClick={() => navigate("/properties")}
          className="inline-flex items-center gap-1.5 text-[1.375rem] font-semibold leading-tight tracking-[-0.01em] transition-colors duration-150 hover:text-muted-foreground"
        >
          <ArrowLeft className="size-4 text-muted-foreground" aria-hidden />
          Properties
        </button>
      }
      width="max-w-7xl"
    >
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn("flex size-12 items-center justify-center rounded-md", palette.bg, palette.text)}>
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.01em]">{property.name}</h1>
                <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {TYPE_LABEL[property.type] ?? property.type}
                </span>
              </div>
              {(property.address || property.city) && (
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => setEditingProperty(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit property
          </Button>
        </header>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard label="Units" value={String(units.length)} />
          <SummaryCard label="Occupied" value={`${occupied}/${units.length}`} />
          <SummaryCard label="Market rent" value={formatMoney(totalRent, app.settings.currency)} />
          <SummaryCard label="Open work orders" value={String(openWorkOrders.length)} tone={openWorkOrders.length > 0 ? "warn" : "default"} />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[1.0625rem] font-semibold leading-tight">Units</h2>
            <Button size="sm" onClick={() => { setEditingUnit(undefined); setUnitDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> New unit
            </Button>
          </div>
          {units.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No units yet. Add one to start tracking leases and rent.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {units.map((u) => (
                <Card key={u.id} className="cursor-pointer p-4 transition-colors duration-150 hover:bg-muted" onClick={() => { setEditingUnit(u); setUnitDialogOpen(true); }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{u.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {u.bedrooms} bd · {u.bathrooms} ba{u.sqft ? ` · ${u.sqft} sqft` : ""}
                      </p>
                    </div>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_TONE[u.status])}>
                      {u.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t pt-3">
                    <div>
                      <div className="stat-label">Market rent</div>
                      <div className="text-sm font-semibold tabular-nums">{formatMoney(u.market_rent, app.settings.currency)}</div>
                    </div>
                    {u.active_tenant_name && (
                      <div className="text-right text-xs text-muted-foreground">{u.active_tenant_name}</div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[1.0625rem] font-semibold leading-tight">Work orders</h2>
            <Button size="sm" variant="outline" onClick={() => setWoDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New work order
            </Button>
          </div>
          {workOrders.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No work orders for this property.</Card>
          ) : (
            <Card className="divide-y">
              {workOrders.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{w.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[w.unit_name, w.vendor_name, formatDate(w.created_at)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="neutral" className="capitalize">{w.priority}</Badge>
                    <Badge variant="secondary" className="capitalize">{w.status.replace("_", " ")}</Badge>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>

      <PropertyDialog
        open={editingProperty}
        onOpenChange={(o) => { setEditingProperty(o); if (!o) load(); }}
        property={property}
      />
      <UnitDialog
        open={unitDialogOpen}
        onOpenChange={(o) => { setUnitDialogOpen(o); if (!o) load(); }}
        propertyId={property.id}
        unit={editingUnit}
      />
      <WorkOrderDialog
        open={woDialogOpen}
        onOpenChange={(o) => { setWoDialogOpen(o); if (!o) load(); }}
        defaults={{ property_id: property.id }}
      />
    </PageShell>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "warn" && "text-warning")}>{value}</div>
    </Card>
  );
}
