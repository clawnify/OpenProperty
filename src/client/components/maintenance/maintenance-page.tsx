import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Plus, Search, Wrench } from "lucide-react";
import { useApp } from "@/context";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkOrderDialog } from "./work-order-dialog";
import type { WorkOrder } from "@/types";
import { filterWorkOrders, workOrderReference, type WorkOrderFilter } from "@/lib/work-order-search";
import { PageShell } from "@/components/page-shell";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-destructive-tint text-destructive",
  high: "bg-warning-tint text-warning",
  normal: "bg-info-tint text-info",
  low: "bg-muted text-muted-foreground",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary",
  assigned: "default",
  in_progress: "default",
  completed: "outline",
  cancelled: "outline",
};

export function MaintenancePage() {
  const app = useApp();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<WorkOrderFilter>("open_all");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | undefined>(undefined);

  async function load() {
    try {
      setLoading(true);
      const list = await app.listWorkOrders();
      setOrders(list);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const counts = useMemo(() => {
    const c = { all: orders.length, open: 0, assigned: 0, in_progress: 0, completed: 0, urgent: 0 };
    for (const o of orders) {
      if (o.status === "open") c.open++;
      if (o.status === "assigned") c.assigned++;
      if (o.status === "in_progress") c.in_progress++;
      if (o.status === "completed") c.completed++;
      if (o.priority === "urgent" && o.status !== "completed" && o.status !== "cancelled") c.urgent++;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(() => filterWorkOrders(orders, filter, query), [orders, filter, query]);

  return (
    <PageShell
      title="Maintenance"
      meta={<>
          {counts.open + counts.assigned + counts.in_progress} open
          {counts.urgent > 0 && (
            <span className="badge-tone tone-danger ml-2">
              <CircleAlert className="h-3 w-3" /> {counts.urgent} urgent
            </span>
          )}
        </>}
      actions={
        orders.length > 0 ? (
          <Button aria-label="New work order" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden /> <span className="sm:hidden">New</span><span className="hidden sm:inline">New work order</span>
          </Button>
        ) : null
      }
    >

        <div className="space-y-3">
          <div className="relative">
            <Label htmlFor="work-order-search" className="sr-only">Search work orders</Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="work-order-search" type="search" placeholder="Search reference, title, property…" className="pl-9"
              value={query} onChange={(e) => setQuery(e.target.value)} aria-describedby="work-order-search-help" />
          </div>
          <p id="work-order-search-help" className="text-xs text-muted-foreground">Use a reference like WO-42, or search title, description, property, unit, tenant or vendor.</p>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as WorkOrderFilter)}>
            <TabsList aria-label="Work order status" className="h-auto flex-wrap justify-start">
              <TabsTrigger value="open_all">Open</TabsTrigger>
              <TabsTrigger value="open">Unassigned</TabsTrigger>
              <TabsTrigger value="assigned">Assigned</TabsTrigger>
              <TabsTrigger value="in_progress">In progress</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          {!loading && orders.length > 0 && (
            <p role="status" className="text-xs text-muted-foreground">Showing {filtered.length} of {orders.length} work orders</p>
          )}
        </div>

        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <Wrench className="size-7 text-faint" aria-hidden />
            <p className="font-medium">{orders.length === 0 ? "No work orders yet" : "No matching work orders"}</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {orders.length === 0 ? "Track repairs and turnover work for your properties." : "Try another search or choose All to include completed and cancelled work orders."}
            </p>
            {orders.length > 0 && (
              <Button variant="outline" className="mt-2" onClick={() => { setQuery(""); setFilter("all"); }}>Clear search and filters</Button>
            )}
            {orders.length === 0 && (
              <Button className="mt-2" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> New work order
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((w) => (
              <Card key={w.id}>
                <button type="button" className="flex h-full w-full flex-col rounded-md p-4 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  aria-label={`Open work order ${workOrderReference(w.id)}: ${w.title}`}
                  onClick={() => { setEditing(w); setDialogOpen(true); }}>
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs tabular-nums text-muted-foreground">{workOrderReference(w.id)}</p>
                      <h3 className="truncate font-semibold">{w.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[w.property_name, w.unit_name].filter(Boolean).join(" · ") || "Unassigned"}
                      </p>
                    </div>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", PRIORITY_TONE[w.priority])}>
                      {w.priority === "urgent" && <CircleAlert className="mr-1 h-3 w-3" />}
                      {w.priority}
                    </span>
                  </div>
                  {w.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{w.description}</p>
                  )}
                  <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT[w.status] ?? "secondary"} className="capitalize">{w.status.replace("_", " ")}</Badge>
                      {w.vendor_name && <span className="text-muted-foreground">{w.vendor_name}</span>}
                    </div>
                    <div className="text-right text-muted-foreground">
                      {w.scheduled_at && <div>Scheduled {formatDate(w.scheduled_at)}</div>}
                      {w.cost != null && <div className="font-medium tabular-nums text-foreground">{formatMoney(w.cost, app.settings.currency)}</div>}
                      {!w.scheduled_at && w.cost == null && <div>Created {formatDate(w.created_at)}</div>}
                    </div>
                  </div>
                </button>
              </Card>
            ))}
          </div>
        )}

      <WorkOrderDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) load(); }}
        workOrder={editing}
      />
    </PageShell>
  );
}
