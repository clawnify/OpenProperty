import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Search } from "lucide-react";
import { useApp } from "@/context";
import { cn, daysBetween, formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaseDialog } from "./lease-dialog";
import type { Lease, LeaseStatus } from "@/types";
import { PageShell } from "@/components/page-shell";

const STATUS_TONE: Record<string, string> = {
  active: "default",
  upcoming: "secondary",
  ended: "outline",
  cancelled: "outline",
};

export function LeasesPage({ navigate }: { navigate: (to: string) => void }) {
  const app = useApp();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeaseStatus | "all">("active");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lease | undefined>(undefined);

  async function load() {
    try {
      setLoading(true);
      const list = await app.listLeases();
      setLeases(list);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    let out = leases;
    if (filter !== "all") out = out.filter((l) => l.status === filter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((l) =>
        `${l.tenant_first_name ?? ""} ${l.tenant_last_name ?? ""} ${l.property_name ?? ""} ${l.unit_name ?? ""}`.toLowerCase().includes(needle),
      );
    }
    return out;
  }, [leases, filter, q]);

  return (
    <PageShell
      title="Leases"
      meta={`${leases.length} total · ${leases.filter((l) => l.status === "active").length} active`}
      actions={
        leases.length > 0 ? (
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> New lease
          </Button>
        ) : null
      }
    >

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as LeaseStatus | "all")}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="ended">Ended</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search leases" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <ClipboardList className="size-7 text-faint" aria-hidden />
            <p className="font-medium">No leases here</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{leases.length === 0 ? "Create your first lease to start collecting rent." : "Try a different filter."}</p>
            {leases.length === 0 && (
              <Button className="mt-2" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> New lease
              </Button>
            )}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property · Unit</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const today = toIsoDate(new Date());
                  const daysToEnd = daysBetween(today, l.end_date);
                  const ending = l.status === "active" && daysToEnd >= 0 && daysToEnd <= 30;
                  return (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer"
                      onClick={() => { setEditing(l); setDialogOpen(true); }}
                    >
                      <TableCell>
                        {l.primary_tenant_id ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/tenants/${l.primary_tenant_id}`); }}
                            className="text-left font-medium hover:underline"
                          >
                            {l.tenant_first_name} {l.tenant_last_name}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No tenant</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          <span className="text-muted-foreground">{l.property_name}</span>
                          <span className="px-1 text-muted-foreground/40">·</span>
                          <span className="font-medium">{l.unit_name}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(l.start_date)} → {formatDate(l.end_date)}</div>
                        {ending && <div className="text-xs text-warning">Ends in {daysToEnd} day{daysToEnd === 1 ? "" : "s"}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(l.monthly_rent, app.settings.currency)}/mo</TableCell>
                      <TableCell>
                        <Badge variant={(STATUS_TONE[l.status] ?? "secondary") as never} className={cn("capitalize")}>
                          {l.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

      <LeaseDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) load(); }}
        lease={editing}
      />
    </PageShell>
  );
}
