# KodiTrack: landlord conversation and demo guide

## Positioning

Lead with the landlord's day-to-day process, not a feature list. KodiTrack is an early property-operations workspace for keeping property, tenant, lease, rent, payment, arrears, and maintenance records together. The pitch is organization and visibility—not guaranteed collections, legal compliance, or automatic recovery of rent.

Never imply a feature is available to a customer until it has been tested in the version they will use. Do not promise savings or payment automation without evidence.

## A respectful opening

> How do you currently keep track of rent due, payments received, and maintenance issues? I am building KodiTrack to make those records easier to see in one place. Could I ask a few questions about your process and, if it seems relevant, show you a short example?

Ask permission before demonstrating. If KodiTrack does not address a real problem for them, thank them and do not pressure them.

## Discovery questions

- How many properties and units do you manage?
- Where do you record leases, rent due dates, receipts, and tenant contact details?
- What is the most common mistake or delay in that process?
- How do you spot arrears and follow up today?
- How do you reconcile a payment that is larger than the rent due?
- How do tenants report repairs, and how do you know a repair is complete?
- Which tools or services have you already tried? What did you dislike?
- What information would you need before trusting a new system with operational records?
- Who else would need to approve the purchase?
- What outcome would make a paid trial worthwhile to you?

Reflect their answer back before presenting a solution. Do not collect real tenant data during an informal demo.

## Five-minute demo sequence

Use a synthetic property and tenant.

1. **Portfolio view:** show the property/unit list and occupancy overview.
2. **Lease and rent:** open a lease, show the rent charge for a period, and explain how the outstanding balance is calculated.
3. **Payment record:** record a sample payment with a reference. If it exceeds the selected charge, show that the full receipt is preserved, cash applied is separated from the surplus, and surplus credit is assigned to the same lease for older unpaid rent.
4. **Arrears and reports:** show how cash and credits appear separately. Explain that a CSV export is an operational record and should be reconciled with the landlord's bank or M-Pesa statement.
5. **Maintenance:** create a synthetic work order and show its status.
6. **Close with fit:** ask which part would matter in their real workflow and what is missing.

Do not run a live payment during a sales demo. Do not present test callbacks, simulated payments, or a successful local build as proof of production payment reliability.

## Value statement (only when it matches what they told you)

> From what you described, the recurring difficulty is [their stated problem]. KodiTrack may help by keeping [relevant records] together and making [specific next action] easier to see. It will not replace your bank or M-Pesa statement, and we should test it on a small, controlled workflow before you rely on it.

## Common objections

**“I already use a spreadsheet.”**  
That may be working well. Ask what becomes difficult as properties or exceptions grow. Demonstrate only the workflow that addresses their answer; if their spreadsheet is sufficient, say so.

**“Can you guarantee rent will be paid on time?”**  
No. Software can make records and follow-up more organized; it cannot guarantee tenant behavior or collection.

**“Does it do full accounting?”**  
No. Its rent ledger distinguishes receipts, cash applied, rent credits, and remaining rent balances. It is not double-entry bookkeeping, tax accounting, trust accounting, or a replacement for professional reconciliation.

**“Can tenants pay through M-Pesa?”**  
The codebase contains Daraja-related STK Push and callback paths, but that does not prove your account, credentials, callbacks, settlement, and reconciliation are production-ready. Confirm the exact deployed configuration and complete a controlled test before promising this workflow.

**“What happens if I enter too much?”**  
The receipt amount remains recorded. The part needed for the selected charge applies there; the excess becomes a credit on that lease and is allocated to the oldest unpaid rent charge. Review the receipt and ledger, then reconcile them to your payment statement.

**“How much does it cost?”**  
State only a price and terms that have actually been approved. If pricing is not settled, say that plainly and ask what pricing model would be appropriate for their portfolio.

## Close without pressure

> Based on what we covered, is there one workflow you would be willing to test with sample data or a small pilot? What would you need to see before you would consider paying for it?

Record the requested outcome, objections, and follow-up date. Do not promise a feature or deadline until it is scoped and agreed.

## Ethical sales checklist

- Use synthetic data in demos.
- Describe limitations and availability accurately.
- Do not claim customer results, market leadership, security certification, or accounting compliance without evidence.
- Do not request passwords, M-Pesa PINs, or payment credentials from a prospect.
- Get explicit consent before importing any real data.
- Agree on pilot scope, data handling, support, price, and exit/deletion process in writing.
