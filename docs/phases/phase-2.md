# Phase 2 — Account approval + Applications UI (R2, R8)

**Status:** Implemented on branch `cursor/phase2-account-approval-0924` (LGA-7).  
**Depends on:** Phase 1 Auth + `user_roles.account_status` + approved-only RLS helpers (**done** on `master`).  
**Out of scope here:** Tenant maintenance submit (Phase 3), website CTA (Phase 4), documents (Phase 5), email/push/messaging (Phase 6 **deferred** — use popups/toasts).

---

## Goal

Pending users cannot use the portal; admins can **approve / reject / suspend** accounts; rental **Applications** UI is clearly separate from account approval.

**DoD**

- [x] Signup (or invite) lands in `account_status = pending` after email verification
- [x] Pending / rejected / suspended cannot load portfolio data (UI + RLS — Phase 1 helpers + Phase 2 UX)
- [x] Admin Users page can list users by status and change status
- [x] Applications list/detail exists and is labeled as rental applicants (not the approval queue)
- [ ] QA checklist signed off (manual env checks; `pnpm typecheck` / `pnpm build` in PR)

---

## Phase 1 leftovers (Phase 1.5 — not Phase 2 product)

| Priority | Item | Notes |
|----------|------|--------|
| High | Gate **all** portfolio mutate UI on `isAdmin` | **Done** on `master` (`3fc7a64`) — `canMutatePortfolio` / hook guards |
| Must | Fix `lease-dialog.tsx` `useEffect([open, app])` | **Done** on `master` (`3fc7a64`) — cancel + stable callbacks |
| Medium | Payment ledger RPC (record + delete) | **Done** Phase 1.5 — `public.record_payment` / `delete_payment` |
| Medium | `FORCE ROW LEVEL SECURITY` on Phase 1 tables | **Done** Phase 1.5 — Leases, LeaseTenants, RentCharges, Payments, Vendors, Settings |
| Medium | Narrow `vendors_select` for landlords | **Done** Phase 1.5 — staff/admin only |
| Should | Soft-fail bootstrap / `generateCharges` error swallowing | **Done** — Rent Generate charges → NoticeBanner / ErrorBanner (`feedbackForGenerateCharges`) |
| Perf | Dashboard / charges N+1 | Tracked in [`docs/deferred-work.md`](../deferred-work.md) |
| Should | Payment ledger / status RPC tests | Tracked in [`docs/deferred-work.md`](../deferred-work.md) |

Track as Cursor Project task **Phase 1.5** (**LGA-6**). High + lease-dialog + Medium items done; parked Should/Perf → [`deferred-work.md`](../deferred-work.md).

---

## What Phase 1 already delivered (reuse)

- Column `user_roles.account_status` (`pending|approved|rejected|suspended`), default `pending`
- `private.assign_admin` sets `approved`
- App gate: `unapproved` / `forbidden` / `error` / `ready`
- SQL helpers require `approved`
- Open D1 `/api` retired (410)

Phase 2 adds **admin UX + policies to change status** and **Applications screens**, plus signup → verify → pending.

---

## Dependency graph

```mermaid
flowchart LR
  P1[Phase1_DONE] --> BE2a[BE_P2a_status_policies]
  BE2a --> FE2b[FE_P2b_Users_approval]
  BE2a --> FE2c[FE_P2c_Applications]
  FE2b --> QA2[QA_P2]
  FE2c --> QA2
```

---

## Agent packages

### P2a — BE: Status policies + admin update path

- [x] Admin-only policies (or SECURITY DEFINER RPC) to update `user_roles.account_status`
- [x] Ensure non-admins cannot self-approve
- [x] Optional RPC `approve_user` / `set_account_status` (+ `list_user_accounts_for_admin`, `admin_set_user_role`)
- [x] Applications: add read (and admin write) RLS — staff/admin CRUD; delete admin-only; FORCE RLS
- [x] Migration under `supabase/migrations/`; update `docs/supabase-schema.md`
- [x] Do **not** break `inquiries`

**Acceptance:** Admin can change status via SQL/RPC; pending JWT cannot SELECT portfolio; Applications selectable by admin.

### P2b — FE: Users / approval queue

- [x] Admin-only nav **Users**
- [x] List `user_roles` (+ email via safe view/RPC — never service role in client)
- [x] Filters: pending / approved / rejected / suspended
- [x] Actions: Approve, Reject, Suspend (and optionally Re-approve) with confirm **popups**
- [x] Signup → email verify → `pending`; copy explains wait for approval
- [x] After approve, prompt refresh / re-login (“Check again” on blocked page)

**Acceptance:** Admin clears pending queue; pending user blocked until approved.

### P2c — FE: Applications (rental applicants)

- [x] Nav/page **Applications** labeled "Rental applications"
- [x] List/detail for `Applications` (status, unit, contact, notes)
- [x] Staff/admin create/edit/update status
- [x] Empty states; no confusion with Users page

### P2d — QA

| # | Check | Expected |
|---|--------|----------|
| 1 | New signup / pending user | Blocked UI + denied portfolio queries |
| 2 | Admin approves | User reaches portfolio after session refresh |
| 3 | Reject / suspend | Access revoked on next resolve |
| 4 | Non-admin cannot change statuses | RPC/RLS deny |
| 5 | Applications page | Labeled; not mixed with Users |
| 6 | Website inquiries | Still works via service role |

---

## Open questions (resolved in P2a)

1. **Public signup vs invite-only:** Public email signup enabled in portal UI; unmatched emails get pending `maintenance` via `handle_new_user`.
2. **Email in Users list:** `list_user_accounts_for_admin()` SECURITY DEFINER joins `auth.users` (no service role in client).
3. **Landlords in same queue:** Yes — all Auth users listed; filter by status; role/link editable.
