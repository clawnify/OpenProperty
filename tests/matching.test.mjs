import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite, m;
before(async () => {
  vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  m = await vite.ssrLoadModule("/src/shared/matching.ts");
});
after(async () => { await vite?.close(); });

// Four leases. Marcus owes October; Owen owes the rest of October after a
// partial; Hannah owes September and October; Sofia and Ethan both owe 1,950.
const leases = [
  { id: 1, tenant_names: ["Marcus Reed"], unit_name: "101" },
  { id: 2, tenant_names: ["Owen Brooks"], unit_name: "Unit 3" },
  { id: 3, tenant_names: ["Hannah Lee"], unit_name: "202" },
  { id: 4, tenant_names: ["Sofia Rossi"], unit_name: "102" },
  { id: 5, tenant_names: ["Ethan Walsh"], unit_name: "201" },
];
const charges = [
  { id: 11, lease_id: 1, period: "2026-10", due_date: "2026-10-01", balance: 1650 },
  { id: 21, lease_id: 2, period: "2026-10", due_date: "2026-10-01", balance: 950 },
  { id: 30, lease_id: 3, period: "2026-09", due_date: "2026-09-01", balance: 1950 },
  { id: 31, lease_id: 3, period: "2026-10", due_date: "2026-10-01", balance: 1950 },
  { id: 41, lease_id: 4, period: "2026-10", due_date: "2026-10-01", balance: 1950 },
  { id: 51, lease_id: 5, period: "2026-10", due_date: "2026-10-01", balance: 1950 },
];
const ctx = (payers = []) => ({ leases, charges, payers });
const tx = (o) => ({ booked_on: "2026-10-03", payer_name: null, payer_account: null, reference: null, ...o });

test("a payer confirmed before, paying exactly what is owed, is recorded on import", () => {
  const p = m.propose(tx({ amount: 1650, payer_name: "REED MARCUS", payer_account: "DE89 3704 0044 0532 0130 00" }),
    ctx([{ lease_id: 1, payer_account: "DE89370400440532013000", payer_name: null }]));
  assert.equal(p.kind, "auto");
  assert.deepEqual(p.allocations, [{ charge_id: 11, amount: 1650 }]);
  assert.deepEqual(p.evidence, ["known_account", "tenant_name", "amount_exact"]);
});

test("the same payer for the first time is only a suggestion", () => {
  const p = m.propose(tx({ amount: 1650, payer_name: "Marcus Reed" }), ctx());
  assert.equal(p.kind, "suggested");
  assert.equal(p.lease_id, 1);
});

test("a known payer paying less is a suggested partial payment, not automatic", () => {
  const p = m.propose(tx({ amount: 900, payer_name: "Marcus Reed" }), ctx([{ lease_id: 1, payer_account: null, payer_name: "marcus reed" }]));
  assert.equal(p.kind, "suggested");
  assert.deepEqual(p.allocations, [{ charge_id: 11, amount: 900 }]);
  assert.equal(p.unapplied, 0);
});

test("two months in one transfer pay the oldest first, exactly", () => {
  const p = m.propose(tx({ amount: 3900, payer_account: "LT121000011101001000" }),
    ctx([{ lease_id: 3, payer_account: "LT121000011101001000", payer_name: null }]));
  assert.equal(p.kind, "auto");
  assert.deepEqual(p.allocations, [{ charge_id: 30, amount: 1950 }, { charge_id: 31, amount: 1950 }]);
});

test("a month named in the reference is paid before the oldest one", () => {
  const p = m.propose(tx({ amount: 1950, payer_name: "Hannah Lee", reference: "Miete Oktober" }), ctx());
  assert.deepEqual(p.allocations, [{ charge_id: 31, amount: 1950 }]);
});

test("more than is owed: the rest is left unapplied, never guessed", () => {
  const p = m.propose(tx({ amount: 2000, payer_name: "Marcus Reed" }), ctx([{ lease_id: 1, payer_account: null, payer_name: "marcus reed" }]));
  assert.equal(p.kind, "suggested");
  assert.deepEqual(p.allocations, [{ charge_id: 11, amount: 1650 }]);
  assert.equal(p.unapplied, 350);
});

test("a junk reference and an unknown payer: an amount two leases owe is no answer", () => {
  const p = m.propose(tx({ amount: 1950, payer_name: "J SMITH", reference: "Enviado pela revolut" }), ctx());
  assert.equal(p.kind, "none");
  assert.deepEqual(p.candidates.sort(), [3, 4, 5]);
});

test("an amount only one lease owes is a suggestion on the amount alone", () => {
  const p = m.propose(tx({ amount: 950, payer_name: "Unknown Payer" }), ctx());
  assert.equal(p.kind, "suggested");
  assert.equal(p.lease_id, 2);
  assert.deepEqual(p.evidence, ["amount_only"]);
});

test("a parent paying (same surname) is suggested only when the amount agrees", () => {
  const yes = m.propose(tx({ amount: 950, payer_name: "Linda Brooks" }), ctx());
  assert.equal(yes.kind, "suggested");
  assert.deepEqual(yes.evidence, ["tenant_last_name", "amount_exact"]);
  const no = m.propose(tx({ amount: 400, payer_name: "Linda Brooks" }), ctx());
  assert.equal(no.kind, "none");
  assert.deepEqual(no.candidates, [2]);
});

test("one known IBAN that pays two leases picks the lease the amount fits, but never automatically", () => {
  const payers = [
    { lease_id: 4, payer_account: "IT60X0542811101000000123456", payer_name: null },
    { lease_id: 2, payer_account: "IT60X0542811101000000123456", payer_name: null },
  ];
  const p = m.propose(tx({ amount: 950, payer_account: "IT60 X054 2811 1010 0000 0123 456" }), ctx(payers));
  assert.equal(p.kind, "suggested");
  assert.equal(p.lease_id, 2);
});

test("a US description line: the sender is read from it and remembered", () => {
  const line = tx({ amount: 1650, reference: "ZELLE FROM MARCUS REED ON 10/01 REF # PP0ABC123" });
  assert.equal(m.nameFromDescription(line.reference), "marcus reed");
  const key = m.payerKey(line);
  assert.deepEqual(key, { payer_account: null, payer_name: "marcus reed" });
  const p = m.propose(line, ctx([{ lease_id: 1, ...key }]));
  assert.equal(p.kind, "auto");
});

test("money out is never matched", () => {
  assert.equal(m.propose(tx({ amount: -84.5, payer_name: "Marcus Reed" }), ctx()).kind, "none");
});

test("month names in the languages references are written in", () => {
  assert.equal(m.periodHint("Miete Oktober", "2026-10-02"), "2026-10");
  assert.equal(m.periodHint("affitto ottobre 2026", "2026-11-02"), "2026-10");
  assert.equal(m.periodHint("loyer décembre", "2027-01-03"), "2026-12");
  assert.equal(m.periodHint("rent 10/2026", "2026-10-02"), "2026-10");
  assert.equal(m.periodHint("Enviado pela revolut", "2026-10-02"), null);
});
