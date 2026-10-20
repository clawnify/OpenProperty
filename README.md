# KodiTrack

KodiTrack is a property-management web application for landlords and small property managers. It brings property and unit records, tenant and lease details, rent charges and receipts, arrears reporting, and maintenance work orders into one workspace.

The project is an early product, not a certified accounting package or a substitute for legal, tax, or regulated financial advice. Rent records and exports should be reconciled with the landlord's bank and M-Pesa statements.

## Current capabilities

- Manage properties, units, tenants, leases, and vendor records.
- Generate monthly rent charges and review balances by period.
- Record payment receipts, references, and dates.
- Keep a rent overpayment as a lease-scoped credit and apply it to older unpaid rent charges; reports distinguish cash applied from credit applied.
- Review arrears, payment history, and CSV exports.
- Track maintenance work orders and upcoming lease expirations.
- Install the web app on supported browsers. The service worker caches the app shell only; it does not make API data or payment operations available offline.
- Render the client-side not-found screen for unknown page paths on the configured Cloudflare Workers assets deployment.

## Plans and renewals

New accounts choose a paid plan through the M-Pesa checkout. Each plan has separate property and rental-unit caps:

- **Solo:** KSh 1,500/month, up to 2 properties and 15 units.
- **Growth:** KSh 3,000/month, up to 10 properties and 50 units.
- **Portfolio:** KSh 4,900/month, up to 30 properties and 100 units.

Plans renew manually; the application does not automatically charge a customer's M-Pesa account. Existing legacy accounts retain their prior access and are not converted automatically. Do not treat the payment simulation as a production payment.

## Technology

- React, Vite, and TypeScript
- Hono on Cloudflare Workers
- Cloudflare D1
- Tailwind CSS

## Requirements

- Node.js compatible with the dependencies in `package.json`
- pnpm
- A Cloudflare account and Wrangler authentication for Cloudflare deployment

## Local development

```sh
pnpm install
pnpm dev
```

The local development command applies `src/server/schema.sql` to Wrangler's local D1 database and starts Vite and Wrangler. Use only test data locally. Runtime initialization also contains compatibility migrations for older databases.

Useful checks:

```sh
pnpm typecheck
pnpm build
```

## Cloudflare deployment

1. Configure the D1 binding and database for your own Cloudflare account in `wrangler.toml`. Do not publish account credentials, API tokens, or production database secrets.
2. Apply the schema to the intended remote D1 database using Wrangler's remote D1 execution option and `src/server/schema.sql`. Back up important production data before schema changes.
3. Set Daraja credentials and other private configuration as Worker secrets/environment bindings, not in source control. See [the Daraja guide](./docs/MPESA-DARAJA-GUIDE.md).
4. Build and deploy with Wrangler using your project's deployment workflow. Confirm the deployed Worker serves the manifest, icon, and service worker, and test an unknown browser route.
5. Use the deployed HTTPS origin as the canonical public origin. Configure Daraja callback URLs to the same origin and verify callback delivery from the provider.

The static asset configuration uses SPA fallback for page routes. Do not configure API routes or real static asset misses to return the app HTML; verify API errors and missing assets remain understandable after deployment.

## Rent credits and recordkeeping

When a recorded payment exceeds the open balance on its selected charge, the receipt remains recorded for its full amount. The amount needed for that charge is applied to it; the excess becomes a credit on the same lease and is applied to the oldest unpaid rent charge on that lease. The ledger tracks cash applied and credit applied separately. Deleting a payment reverses its credit allocations and is intended for correcting an erroneous entry, not for routine bookkeeping.

This is an operational rent ledger, not double-entry accounting. It does not model a landlord's bank balance, escrow/client-money trust requirements, expenses, tax treatment, refunds, or full audit controls. Keep source receipts and reconcile each period against bank and M-Pesa statements.

## Security and production readiness

- Never commit passwords, access tokens, Daraja keys/passkeys, database credentials, or real tenant data.
- Keep `ALLOW_PAYMENT_SIMULATION` disabled in production.
- Test payment callbacks, duplicate delivery, account isolation, backup/restore, and failure recovery before collecting real money.
- Review Cloudflare logs without exposing personal or payment information.
- See the pitch and implementation materials in [`docs/`](./docs/).

## License

See [`LICENSE`](./LICENSE) for the repository's license terms.
