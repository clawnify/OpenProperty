/**
 * R8 — Admin web portal (data behind the screens)
 * The dashboard, user management, rental applications, vendors and settings an
 * admin runs the business from. Screen-level checks live in tests/e2e.
 */
import { beforeAll, describe, expect, test } from "vitest";
import * as data from "@/lib/data";
import { clientFor, expectDenied, resetWorld, signInApp, sql, type World } from "../support/harness";

let world: World;

beforeAll(async () => {
  world = await resetWorld();
  await sql(
    `insert into public."MaintenanceRequests" (title, description, category, priority, unit_id, property_id, submitted_by_tenant_id)
     values ('Burst pipe', 'Water everywhere', 'Plumbing', 'Urgent', $1, $2, $3),
            ('Squeaky door', 'Annoying', 'General repair', 'Low', $1, $2, $3)`,
    [world.units.a.id, world.property.id, world.tenants.tenant.id],
  );
});

describe("[R8] Admin web portal", () => {
  describe("dashboard", () => {
    test("shows portfolio totals and open work for an admin", async () => {
      await signInApp("admin");
      const summary = await data.getDashboardSummary();
      expect(summary).toMatchObject({
        properties: 2,
        units: 3,
        occupied: 3,
        occupancy_rate: 100,
        open_work_orders: 2,
        urgent_work_orders: 1,
      });
      expect(summary.recent_work_orders.map((w) => w.title).sort()).toEqual(["Burst pipe", "Squeaky door"]);
    });
  });

  describe("charges (WS-N N1)", () => {
    test("generateCharges batches missing period rows and listCharges enriches only those leases", async () => {
      await sql(
        `insert into public."Leases" (unit_id, primary_tenant_id, start_date, end_date, monthly_rent, rent_due_day, status)
         values ($1, $2, '2026-01-01', '2026-12-31', 1500, 1, 'active'),
                ($3, $4, '2026-01-01', '2026-12-31', 1600, 5, 'active')`,
        [world.units.a.id, world.tenants.tenant.id, world.units.b.id, world.tenants.tenant2.id],
      );
      await signInApp("admin");
      const period = "2098-06";
      const first = await data.generateCharges(period);
      expect(first.created).toBe(2);
      expect(first.activeLeases).toBeGreaterThanOrEqual(2);
      const second = await data.generateCharges(period);
      expect(second.created).toBe(0);
      expect(second.activeLeases).toBe(first.activeLeases);

      const listed = await data.listCharges(period);
      expect(listed).toHaveLength(2);
      expect(listed.every((c) => c.period === period)).toBe(true);
      expect(listed.map((c) => c.unit_name).sort()).toEqual(["1A", "2B"]);
    });
  });

  describe("user management", () => {
    test("the admin's user list shows every account, with role and status", async () => {
      await signInApp("admin");
      const accounts = await data.listUserAccounts();
      const byEmail = Object.fromEntries(accounts.map((a) => [a.email, a]));
      expect(byEmail["worker@test.local"]).toMatchObject({ role: "maintenance", account_status: "approved" });
      expect(byEmail["tenant@test.local"]).toMatchObject({ role: "tenant", tenant_id: world.tenants.tenant.id });
      expect(byEmail["pending@test.local"]).toMatchObject({ account_status: "pending" });
    });

    test("the admin can pick from the staff list when assigning work", async () => {
      await signInApp("admin");
      const staff = await data.listStaff();
      expect(staff.map((s) => `${s.first_name} ${s.last_name}`)).toEqual(
        expect.arrayContaining(["Sam Fixit", "Riley Wrench"]),
      );
    });
  });

  describe("rental applications", () => {
    test("staff record an applicant and move them through screening", async () => {
      await signInApp("admin");
      const created = await data.createApplication({
        first_name: "Avery",
        last_name: "Applicant",
        email: "avery@apply.test",
        unit_id: world.units.b.id,
        monthly_income: 5200,
      });
      expect(created).toMatchObject({ status: "new", unit_id: world.units.b.id });
      expect((await data.listApplications()).find((a) => a.id === created.id)).toMatchObject({
        unit_name: "2B",
        property_name: "Maple Court",
      });

      const updated = await data.updateApplication(created.id, { status: "screening" });
      expect(updated.status).toBe("screening");
      expect((await data.listApplications("screening")).map((a) => a.id)).toEqual([created.id]);
    });

    test("rental applications are admin-only — applicant income is private", async () => {
      const [app] = await sql<{ id: number }>(
        `insert into public."Applications" (first_name, last_name, monthly_income) values ('Del', 'Target', 6100) returning id`,
      );
      for (const persona of ["worker", "tenant", "landlord"] as const) {
        const client = await clientFor(persona);
        expectDenied(await client.from("Applications").select("*"), `${persona} must not read applications`);
        expectDenied(await client.from("Applications").insert({ first_name: "X", last_name: "Y" }).select());
        expectDenied(await client.from("Applications").delete().eq("id", app.id).select());
      }
      await signInApp("admin");
      await data.deleteApplication(Number(app.id));
      expect(await sql(`select 1 from public."Applications" where id = $1`, [app.id])).toHaveLength(0);
    });

    test("rental applications are separate from account approval", async () => {
      await signInApp("admin");
      const applications = await data.listApplications();
      const accounts = await data.listUserAccounts();
      expect(applications.every((a) => !accounts.some((u) => u.email === a.email))).toBe(true);
    });
  });

  describe("vendors and settings", () => {
    test("an admin manages the vendor directory", async () => {
      await signInApp("admin");
      const vendor = await data.createVendor({ name: "Bright Sparks", category: "electrician" });
      expect((await data.listVendors()).map((v) => v.name)).toContain("Bright Sparks");
      await data.deleteVendor(vendor.id);
      expect((await data.listVendors()).map((v) => v.name)).not.toContain("Bright Sparks");
    });

    test("an admin saves rent policy settings", async () => {
      await signInApp("admin");
      const saved = await data.updateSettings({ rent_due_day: "5", currency: "USD" });
      expect(saved).toMatchObject({ rent_due_day: "5", currency: "USD" });
      expect(await data.getSettings()).toMatchObject({ rent_due_day: "5" });
    });

    test("a worker can read vendors but cannot read or change settings", async () => {
      const worker = await clientFor("worker");
      expect((await worker.from("Vendors").select("id")).data?.length).toBeGreaterThan(0);
      expectDenied(await worker.from("Vendors").insert({ name: "Worker's cousin" }).select());
      expectDenied(await worker.from("Settings").select("*"), "worker must not read Settings");
      expectDenied(await worker.from("Settings").update({ value: "1" }).eq("key", "rent_due_day").select());
      expectDenied(
        await worker.from("Settings").insert({ key: "worker_probe", value: "x" }).select(),
        "worker must not insert Settings",
      );
      expect(await sql(`select 1 from public."Vendors" where name = 'Worker''s cousin'`)).toHaveLength(0);
      expect(await sql(`select 1 from public."Settings" where key = 'worker_probe'`)).toHaveLength(0);
    });
  });

  describe("the portal is limited to the right people", () => {
    test("the admin-only screens have nothing to show a worker", async () => {
      await signInApp("worker");
      await expect(data.listUserAccounts()).rejects.toThrow(/only admins/i);
    });

    test("a tenant's data layer returns only tenant-scoped data", async () => {
      await signInApp("tenant");
      expect(await data.listVendors()).toEqual([]);
      expect(await data.listApplications()).toEqual([]);
      expect((await data.listProperties()).map((p) => p.name)).toEqual(["Maple Court"]);
    });
  });
});
