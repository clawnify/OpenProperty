<picture>
  <source media="(prefers-color-scheme: dark)" srcset="readme-banner-dark.png" />
  <img src="readme-banner.png" alt="OpenProperty — the monthly rent ledger, with a payment recorded against an overdue charge" width="100%" />
</picture>

# OpenProperty

Property management for landlords and small property managers: properties and
units, tenants and leases, a monthly rent ledger matched from your bank
statement, late-rent reminders, and maintenance work orders with your vendors.

An open-source app template provided by [Clawnify.com](https://clawnify.com).

**Know who has paid this month.** Every active lease gets one charge per month,
generated with one click and never twice. Payments are recorded against the
charge, and its status follows from the money: open, partial, paid or overdue.
Who still owes rent is one filter away.

[![Deploy with Clawnify](https://app.clawnify.com/deploy-button.svg)](https://app.clawnify.com/deploy?repo=clawnify/OpenProperty)

## See it in action

Conceptual UI illustrations of the app's main capabilities, with fictional
example data. Open an image to see the details.

| Rent ledger | Payments |
| --- | --- |
| [![October's rent charges, with Generate charges pressed and nothing charged twice](previews/ledger.png)](previews/ledger.png) | [![A partial payment recorded against an overdue charge](previews/payment.png)](previews/payment.png) |
| **Maintenance** | **Dashboard** |
| [![An urgent work order with a vendor being picked](previews/maintenance.png)](previews/maintenance.png) | [![Occupancy, rent owed, open work orders and lease expirations](previews/dashboard.png)](previews/dashboard.png) |

## What it does

- **Dashboard.** Occupancy, active leases, rent collected and outstanding this
  month, overdue totals, open and urgent work orders, and the leases ending
  soon.
- **Properties and units.** Each property shows its type, address, occupancy
  and its open work orders. A unit tracks bedrooms, bathrooms, size, market rent
  and status: vacant, occupied, turnover or unavailable.
- **Tenants.** A searchable list showing each tenant's current unit, and a
  detail page with contact details, employer, income, emergency contact and
  lease history.
- **Leases.** Term, monthly rent, deposit, due day, late fee and status
  (upcoming, active, ended, cancelled). A lease can have more than one tenant.
- **Rent ledger.** Step through months, generate the month's charges, record
  payments by amount, method, date and reference, and see what was charged,
  collected, outstanding and overdue. Generating again adds only the leases that
  were missing.
- **Bank matching.** Import a statement from your bank: a CSV from any bank
  (the columns, date order and decimal mark are recognised, and you confirm them
  before anything is saved) or a CAMT.053 file from a European bank. Each payment
  in is matched to the rent it pays by who sent it, not by its reference, which
  tenants' banking apps fill with anything. Confirm a payer once and their next
  payment of exactly what they owe is recorded on import. A partial payment, a
  new payer or two leases owing the same amount wait for you with a suggestion
  and the reason for it. Two months in one transfer pay the oldest month first,
  or the month the reference names. A line already imported from an overlapping
  statement is skipped, and every match can be undone.
- **Late-rent reminders.** On the day a reminder falls due, it is listed with
  the email already written: the balance, the due date, the days late and the
  lease's late fee. By default that is a late notice the day after the grace
  period and a final notice at 14 days, and both the timing and the wording are
  yours to change. Open it in your own email, send it, mark it sent. If you come
  back after three weeks you get one final notice, not every step you missed.
  Once the rent is matched, nothing more is offered, and a tenant whose payment
  may be waiting in bank matching is flagged before you write to them.
- **Maintenance.** Work orders with priority and status, linked to a property,
  unit, tenant and vendor, with a scheduled date and a cost.
  Each has a reference such as `WO-42` for phone calls and follow-ups. Search by
  reference, title, description, property, unit, tenant or vendor; choose **All**
  to include completed and cancelled jobs. References identify records within
  your install and do not grant public access.
- **Vendors and policy.** A vendor directory by trade, plus the defaults new
  leases start from: rent due day, late fee, grace days and currency.

A first run seeds three sample properties, five units and three vendors, so the
app is usable before you add anything. Deleted sample data does not come back on
a redeploy.

## What it deliberately doesn't do

- **Take payments.** There is no card or bank processing. The ledger records
  money that arrived some other way.
- **Screen applicants.** Applications are records you keep. There is no credit
  or background check.
- **Send messages for you.** Reminders are drafted here and sent from your own
  email. The app sends nothing to tenants, by email, SMS or otherwise.
- **Publish anything.** No listing syndication, and no public tenant or owner
  portal.

Each of these can be built on top once you have your own copy.

## Running it locally

```bash
pnpm install
pnpm dev          # UI on :5173, API on :8787, schema applied to a local database
pnpm typecheck
pnpm test
pnpm build
```

## Stack

React 19, Vite and TypeScript on the client, with Tailwind CSS v4 and shadcn/ui.
A Hono API on the server, and a SQLite database. The same code runs locally and
in production.

## Data

One SQLite database per install. The schema is `src/server/schema.sql`. The app
writes the defaults and sample data on first run.

| Table | Holds |
|---|---|
| `properties` | buildings, with type, address and a colour tag |
| `units` | rentable spaces inside a property, with rent and status |
| `tenants` | people, with contact, employment and emergency details |
| `leases` | a unit, its primary tenant, term, rent, deposit and late fee |
| `lease_tenants` | the other tenants on a lease |
| `rent_charges` | one charge per lease per month, with what has been paid |
| `payments` | money recorded against a charge |
| `vendors` | contractors by trade |
| `work_orders` | maintenance jobs, with priority, status, vendor and cost |
| `applications` | applicants and where they are in the decision |
| `settings` | rent policy defaults and currency |

## Project layout

```
src/
  server/
    index.ts        API routes for every entity, first-run data
    db.ts           database adapter (query / get / run)
    schema.sql      tables and indexes
  client/
    app.tsx         shell and routing
    components/     dashboard, properties, tenants, leases, rent,
                    maintenance, settings, and shadcn/ui primitives
    hooks/          router and app state
    lib/utils.ts    colours, dates, money and period helpers
```

## Licence

MIT. See [LICENSE](LICENSE).
