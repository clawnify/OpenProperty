import type { WorkOrder, WorkOrderStatus } from "../types";

export type WorkOrderFilter = WorkOrderStatus | "open_all" | "all";

export function workOrderReference(id: number): string {
  return `WO-${id}`;
}

export function filterWorkOrders(orders: WorkOrder[], filter: WorkOrderFilter, query: string): WorkOrder[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
  // References are exact: looking up WO-4 must never return WO-42.
  const reference = /^(?:wo-|#)?(\d+)$/.exec(needle);
  return orders.filter((order) => {
    if (filter === "open_all" && (order.status === "completed" || order.status === "cancelled")) return false;
    if (filter !== "all" && filter !== "open_all" && order.status !== filter) return false;
    if (!needle) return true;
    if (reference) return order.id === Number(reference[1]);
    return [
      order.title, order.description, order.property_name, order.unit_name,
      order.tenant_first_name, order.tenant_last_name, order.vendor_name,
    ].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").includes(needle);
  });
}
