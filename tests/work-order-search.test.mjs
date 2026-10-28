import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite, filterWorkOrders, workOrderReference;
before(async () => {
  vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: "custom" });
  ({ filterWorkOrders, workOrderReference } = await vite.ssrLoadModule("/src/client/lib/work-order-search.ts"));
});
after(async () => { await vite?.close(); });

const orders = [
  { id: 4, title: "Leaking faucet", description: "Kitchen sink", status: "open", property_name: "Oakwood", unit_name: "Unit 1", tenant_first_name: "Ada", tenant_last_name: "Lovelace", vendor_name: "Hill Country Plumbing" },
  { id: 42, title: "Replace lock", status: "assigned", property_name: null, unit_name: null, vendor_name: null },
  { id: 43, title: "Roof inspection", status: "in_progress" },
  { id: 44, title: "Leaking faucet", status: "completed" },
  { id: 45, title: "Leaking faucet", status: "cancelled" },
];
const ids = (filter, query = "") => filterWorkOrders(orders, filter, query).map(o => o.id);

test("references use the existing stable identifier", () => {
  assert.equal(workOrderReference(42), "WO-42");
});

test("references match exactly, case-insensitively, with pasted whitespace", () => {
  for (const q of ["WO-4", " wo-4 ", "#4", "4", "WO-004"]) assert.deepEqual(ids("all", q), [4], q);
  assert.deepEqual(ids("all", "WO-999"), []);
  assert.deepEqual(ids("all", "WO-"), []);
});

test("text search covers title, description, location, tenant and vendor", () => {
  for (const q of ["FAUCET", " kitchen ", "oakwood", "Unit 1", "Ada   Lovelace", "Hill Country"]) {
    assert.deepEqual(ids("open_all", q), [4], q);
  }
});

test("open includes assigned and in progress but excludes closed jobs", () => {
  assert.deepEqual(ids("open_all", " \n "), [4, 42, 43]);
  for (const [status, id] of [["open", 4], ["assigned", 42], ["in_progress", 43], ["completed", 44], ["cancelled", 45]]) {
    assert.deepEqual(ids(status), [id]);
  }
});

test("search combines with the chosen status, including exact references", () => {
  assert.deepEqual(ids("open_all", "WO-44"), []);
  assert.deepEqual(ids("completed", "WO-44"), [44]);
  assert.deepEqual(ids("all", "faucet"), [4, 44, 45]);
  assert.deepEqual(ids("completed", "faucet"), [44]);
});

test("empty or missing joined fields are searchable without throwing", () => {
  assert.deepEqual(ids("all", "lock"), [42]);
  assert.deepEqual(ids("all", "undefined"), []);
  assert.deepEqual(ids("all", "null"), []);
});

test("empty collections and no matches recover with all and an empty query", () => {
  assert.deepEqual(filterWorkOrders([], "all", "WO-4"), []);
  assert.deepEqual(ids("all", "no-such-repair"), []);
  assert.deepEqual(ids("all"), [4, 42, 43, 44, 45]);
});
