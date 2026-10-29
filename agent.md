# OpenProperty: agent guide

OpenProperty is property management for landlords and small property managers:
properties and units, tenants and leases, a rent ledger, bank matching,
late-rent reminders, maintenance and vendors. Every endpoint is under `/api`
on this app's own origin and takes and returns JSON.

## The one rule

**You prepare; a person records money and talks to tenants.** Import a
statement, read the matches, redraft a reminder in the tenant's language: yes.
Confirm a match, mark a reminder sent, or write to a tenant only when the person
asked you to, because a match records money in the ledger and a reminder is the
landlord speaking.

## Rent

- `GET /api/rent-charges?period=YYYY-MM`: the month's charges with tenant, unit
  and `amount_paid`. `status` is `open`, `partial`, `paid`, `overdue` or `waived`.
- `POST /api/rent-charges/generate { period }`: one charge per active lease for
  the month (idempotent).
- `POST /api/payments { charge_id, amount, paid_at, method, reference, notes }`:
  a payment recorded by hand. `method` is `cash`, `check`, `ach`, `credit` or
  `other`.

## Bank matching

Money in from a bank statement, matched to the rent it pays. The payer is the
key: a person confirms once that an IBAN or a sender name pays a lease, and from
then on that payer paying exactly what the lease owes is recorded on import.
Everything else waits in review with a suggestion.

- `POST /api/bank/imports { filename, format, lines }`: `format` is `csv`,
  `camt053` or `api`; up to 500 `lines` a call, each
  `{ booked_on: "YYYY-MM-DD", amount, currency, payer_name, payer_account, reference, bank_ref }`.
  Only money in (`amount > 0`) is kept, and a line already imported from an
  overlapping statement is skipped (by `bank_ref` when the bank gives one).
  Answers `summary { imported, duplicates, auto_matched, to_review }`.
- `GET /api/bank/transactions?status=review|matched|ignored&limit=&offset=`
  (at most 90 a page): each line in review carries `proposal`:
  - `kind`: `auto` or `suggested` (one lease, see `lease` and `allocations`),
    or `none` (see `candidates`).
  - `evidence`: why, strongest first: `known_account`, `known_name`,
    `tenant_name`, `tenant_last_name`, `reference_unit`, `amount_exact`,
    `amount_only`.
  - `unapplied`: money beyond what the lease owes. It is never guessed onto
    another charge.
- `GET /api/bank/leases`: every lease a payment can go to, with its open
  charges and what it owes.
- `POST /api/bank/transactions/:id/match { lease_id, allocations?, remember?, by? }`:
  records the payment. Without `allocations` the money pays the oldest open
  charge first, the month named in the reference first. `remember` (default
  true) makes this payer match the lease on the next import. Send
  `by: "agent"` when you record it.
- `POST /api/bank/transactions/:id/unmatch { forget_payer? }`: takes the
  payments back out.
- `POST /api/bank/transactions/:id/ignore { note }` for money that is not rent
  (a refund, a deposit, a transfer between own accounts), and `/restore`.
- `POST /api/bank/rematch`: matches again everything in review, for payments
  that arrived before their month's charge was generated.
- `GET /api/bank/payers?lease_id=` and `DELETE /api/bank/payers/:id`: the
  remembered payers.

## Late-rent reminders

The app works out which reminder is due for each unpaid charge and drafts it.
The schedule is in settings (`reminder_steps`): by default a late notice the day
after the grace period and a final notice 14 days after the due date, with an
optional reminder before the due date. Only the furthest step reached is
offered, and nothing is offered once the rent is paid.

- `GET /api/reminders`: `due[]`, each with `tenant` (name, email, phone),
  `balance`, `days_late`, `step { key, label }`, `draft { to, subject, body }`
  and `pending_payment`: a payment waiting in bank matching that may be this
  tenant's. When it is set, say so before anyone sends anything.
- `POST /api/reminders { charge_id, step, status, channel, sent_by, recipient, subject, body }`:
  marks a step `sent` or `skipped`, with the text that went out. `channel` is
  `email`, `sms`, `letter`, `phone` or `other`; `sent_by` is `person` or
  `agent`. A step is marked once (a second mark answers 409).
- `DELETE /api/reminders/:id`: undoes a mark, so the step is offered again.

To redraft a reminder (in the tenant's language, say), start from `draft`, keep
every figure and date as given, and hand the text to the person. Formal legal
notices are not drafted here: they depend on the country and belong to the
person and their lawyer.

## Counts

`GET /api/rent/attention` answers `{ bank_review, reminders_due }`, what waits
for a person today.
