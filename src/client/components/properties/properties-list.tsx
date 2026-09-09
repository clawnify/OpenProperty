import { useState } from "react";
import { Building2, MapPin, Plus } from "lucide-react";
import { useApp } from "@/context";
import { cn, colorClasses } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PropertyDialog } from "./property-dialog";
import type { Property } from "@/types";
import { PageShell } from "@/components/page-shell";

const TYPE_LABEL: Record<string, string> = {
  single_family: "Single-family",
  multi_family: "Multi-family",
  condo: "Condo",
  townhouse: "Townhouse",
  commercial: "Commercial",
};

export function PropertiesList({ navigate }: { navigate: (to: string) => void }) {
  const { properties } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Property | undefined>(undefined);

  const totalUnits = properties.reduce((sum, p) => sum + (p.unit_count ?? 0), 0);
  const occupied = properties.reduce((sum, p) => sum + (p.occupied_count ?? 0), 0);

  return (
    <PageShell
      title="Properties"
      meta={`${properties.length} ${properties.length === 1 ? "property" : "properties"} · ${totalUnits} ${totalUnits === 1 ? "unit" : "units"} · ${occupied}/${totalUnits || 0} occupied`}
      actions={
        properties.length > 0 ? (
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            New property
          </Button>
        ) : null
      }
    >
      {properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <Building2 className="size-8 text-faint" aria-hidden />
            <p className="font-medium">No properties yet</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Add your first property to start managing units, leases, and rent.
            </p>
            <Button className="mt-2" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" /> New property
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => {
              const palette = colorClasses(p.color);
              const occRate = p.unit_count
                ? Math.round(((p.occupied_count ?? 0) / p.unit_count) * 100)
                : 0;
              return (
                <Card
                  key={p.id}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden p-5 transition-colors duration-150 hover:bg-muted",
                  )}
                  onClick={() => navigate(`/properties/${p.id}`)}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className={cn("flex size-10 items-center justify-center rounded-md", palette.bg, palette.text)}>
                      <Building2 className="size-5" />
                    </div>
                    <span className="chip">
                      {TYPE_LABEL[p.type] ?? p.type}
                    </span>
                  </div>
                  <h3 className="font-semibold tracking-tight">{p.name}</h3>
                  {(p.address || p.city) && (
                    <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[p.address, p.city, p.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
                    <Stat label="Units" value={p.unit_count ?? 0} />
                    <Stat label="Occupied" value={`${p.occupied_count ?? 0}/${p.unit_count ?? 0}`} />
                    <Stat label="Occupancy" value={`${occRate}%`} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditing(p); setDialogOpen(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </button>
                    {p.year_built && (
                      <span className="text-xs text-muted-foreground">Built {p.year_built}</span>
                    )}
                  </div>
                </Card>
              );
          })}
        </div>
      )}

      <PropertyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        property={editing}
      />
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
