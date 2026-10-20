# M-Pesa Daraja integration guide

This is an implementation and rollout guide, not a statement that the deployed KodiTrack instance is approved or production-ready for payments. Daraja product availability, endpoint versions, onboarding, and callback requirements can change. Confirm the current instructions in the [Safaricom Daraja portal](https://developer.safaricom.co.ke/) and with the relevant M-Pesa business support team before implementation.

## Product choices

| Use case | Typical Daraja path | What it means |
|---|---|---|
| Tenant initiates rent payment from KodiTrack | STK Push (Lipa na M-Pesa Online) | Prompts the customer on their phone to authorize a payment to the configured shortcode. |
| Customer pays a PayBill from their M-Pesa menu | C2B API, where enabled for the business shortcode | Safaricom sends a validation/confirmation notification, according to the product's configuration. The account/reference field can help identify the tenant or rent account. |
| Customer pays a Buy Goods till | Merchant/till collection integration available for the business account | Product onboarding and callback capabilities differ from PayBill. Confirm the supported API and settlement/reporting model for the exact till before designing around it. |

Do not assume a PayBill workflow and Buy Goods workflow have interchangeable account-reference or callback behavior. The business shortcode/till owner must obtain the product and callback configuration from Safaricom.

## Recommended implementation sequence

### 1. Start with a sandbox

- Register an application and obtain sandbox credentials through the official Daraja portal.
- Use only sandbox credentials, test numbers, and synthetic customer/charge data in development.
- Verify the OAuth/token flow and the exact STK Push request fields against the current official API documentation.
- Keep environment selection explicit (`sandbox` versus `production`); never infer production from a missing setting.
- Do not commit credentials, passkeys, tokens, callback verification material, or real customer information.

### 2. Store configuration as Worker secrets

Use Wrangler secret management for confidential values (consumer secret, passkey, and any other provider credentials). Keep non-secret settings such as the environment name in deployment configuration only where appropriate. Never put secret values in:

- source code, README files, screenshots, issue reports, or example commands;
- browser code, HTML, static assets, or client-visible environment variables;
- logs, analytics, error messages, or demo data.

Use a distinct credential set and callback URL per environment. Rotate credentials if they are exposed and review access to production secrets.

### 3. Create an internal payment attempt before calling Daraja

For each attempted payment, persist an internal record containing enough information to reconcile it:

- a server-generated internal ID;
- the user/account and rent charge it is intended to settle;
- expected amount and normalized payer phone number;
- purpose, environment, creation time, and a pending state;
- Daraja CheckoutRequestID and MerchantRequestID when returned;
- final provider result, receipt/reference, and timestamps.

Use a state model such as `pending`, `completed`, `failed`, and (if needed) `needs_review`. Do not mark rent as paid when the STK request is merely accepted. An accepted prompt is not proof of a completed payment.

### 4. Process completion callbacks safely

Treat a callback as an input to verify, not as the accounting record itself:

1. Parse and validate the payload shape and required identifiers.
2. Find exactly one pending internal transaction by the provider request ID.
3. Check purpose, ownership, expected amount, and payer details where supplied.
4. Query Daraja for the transaction result when the configured product supports it, and compare the provider result with the callback.
5. Record the receipt and rent allocation before marking the internal transaction complete. If posting fails, return a failure response so the event can be retried or reviewed.
6. Make processing idempotent: repeated callback delivery must not create another receipt, credit, or subscription activation.
7. Preserve the raw minimum evidence needed for audit, with appropriate privacy retention limits. Avoid storing unnecessary personal data.

Use a database uniqueness constraint or an equivalent atomic idempotency mechanism for provider receipt/request identifiers where feasible. A query-before-insert alone can race when duplicate callbacks arrive concurrently. Do not assume provider IP allowlisting or an unguessable URL alone authenticates a callback; use the provider's documented verification/status-query mechanisms and operational monitoring.

Failed, timed-out, contradictory, or unverifiable callbacks must not silently turn into success. Put ambiguous records into an explicit review path and reconcile them against the provider statement.

### 5. Allocate rent and surplus

Keep the original received amount immutable. Record separate values for:

- gross cash received;
- cash applied to the selected rent charge;
- any excess credited to the same lease;
- each later credit application to a rent charge;
- remaining credit and outstanding rent.

For a charge, the balance is:

`max(0, charge amount - cash applied - credit applied)`

Credits should not exceed the available credit or the target charge balance. A credit must never cross into another landlord's account or another lease by default. Reversals should be auditable and should recalculate affected balances. For financial correctness under concurrent callbacks, enforce these constraints atomically in the database rather than relying only on in-memory calculations.

KodiTrack's operational rent ledger follows this cash/credit separation. It is not a double-entry general ledger, bank balance, escrow ledger, or statutory trust-accounting system. Reconcile receipts and allocations against provider statements and bank settlement records.

### 6. Add PayBill or Buy Goods collection only after onboarding

For customer-initiated PayBill/Buy Goods payments:

- Confirm the business shortcode/till and exact API products enabled by Safaricom.
- Choose a stable account/reference convention that maps a payment to a tenant, lease, or charge without exposing sensitive identifiers.
- Implement the specific validation and confirmation or merchant notification callbacks required for that product.
- Define behavior for unknown references, partial payments, duplicate references, overpayments, refunds, and payments received after a lease ends.
- Keep unmatched payments in a suspense/review queue; do not guess a tenant based on a name or phone number alone.
- Reconcile provider receipts and settlement batches to internal receipts and bank deposits.

Buy Goods integrations may not provide the same account-reference and validation workflow as PayBill. Confirm this with Safaricom before promising automatic charge matching.

## Testing checklist

### Automated and sandbox cases

- Valid STK success with matching amount, phone, and request ID.
- User cancellation, insufficient funds, timeout, and provider failure.
- Delayed callback, duplicate callback, callbacks arriving out of order, and callback retry after a database error.
- Wrong amount, phone, request ID, receipt, purpose, or account ownership.
- Duplicate provider receipt; same reference with conflicting details.
- Exact payment, partial payment, overpayment, and payment against a fully settled charge.
- Credit applied to the oldest unpaid charge; credit remains scoped to the correct lease.
- Deletion/reversal and correction flows, including when credit has already been applied.
- Provider success while rent posting fails; recovery without duplicate receipts.
- Unmatched PayBill/Buy Goods references and settlement discrepancies.

### Production-readiness checklist

- Production account and callback URLs approved and tested with the provider.
- Production secrets are stored as Worker secrets and are not present in build output.
- Simulation routes are disabled in production.
- Rate limits, request validation, logging redaction, alerting, and support ownership are defined.
- Backup and restore are tested before real payments are accepted.
- Daily reconciliation process and exception owner are documented.
- A human can investigate and resolve a disputed or unmatched payment.
- Data retention, privacy notices, refund handling, and customer support procedures are reviewed with qualified local advisers.

## KodiTrack-specific cautions

The repository contains STK Push initiation and callback-handling code, but code presence does not prove a live merchant account, production credentials, successful provider callback delivery, settlement reconciliation, or a completed end-to-end production test. Treat those as launch gates. Before accepting live funds, test the currently deployed build against a Safaricom-approved account and reconcile every test transaction to both the KodiTrack ledger and the provider/bank record.

## Suggested operational runbook

1. Check provider status and Worker error rates.
2. List transactions still pending beyond the expected provider window.
3. Query provider status through the supported API or statements; never mark a payment successful based only on a customer screenshot.
4. Compare amount, receipt, reference, charge, and account ownership.
5. Retry idempotent posting only after confirming whether a receipt already exists.
6. Route unresolved differences to an authorized human reviewer.
7. Record the resolution and reconcile the bank settlement.
