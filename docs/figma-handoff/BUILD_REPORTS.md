# Step 2 subagent reports (condensed)

## Auth — page 20:81, Board 25:76 — DONE, 61 frames
Rows: U1 Sign in (default/error/submitting), U1 Sign up (tenant/owner/validation/confirmation), U2 request link (default/submitting/sent),
U2 new password (default/mismatch/success), U3 blocked (pending/suspended/rejected/no role/couldn't load/restoring session),
N6 Account tenant (default/loading/error/field error/success/failed), N6 admin (default only), N6 how reached (account menu open), D7 not found (tenant/admin).
Foundations gaps: password field w/ show-hide toggle (Icon Button absolutely placed over Field), radio group label, signed-out frame + brand mark + auth card,
notice block, form/shell skeletons, inline error banner (Banner/Error with shadow removed), no "nothing active" nav variant (Account/404 show home active), switch rows 44px on phone.
Known: N6 admin has default only; no server-error frame for U2 request; several clones checked only at overview scale.

## Messages — page 20:78, Board 25:9253 — DONE, 87 frames
Rows: N4 Admin (15), Tenant (15, incl. single conversation), Landlord (14), Worker (8, list only, no thread/composer), N5 Tenant (10), N5 Admin (10).
Foundations gaps: List Row has no Selected state (uses Hover); no notification item (List Row Phone w/ overrides); no popover; no thread header / phone composer bar;
no day divider; no thread skeleton; Composer has no filled state; State/Empty|Error|Filtered Empty have no border (wrapped in card);
nav unread counts fixed per variant (overrode nested count); Header/Phone Close has no trailing action.
Known: not re-screenshotted after late fix: 28:13951, 28:12366, 28:11998. N5 sentences plain text (request name not emphasised). N5 backdrop keeps unread counts.

## Home — page 20:77, Board 25:182 — DONE, 42 frames
Rows: N1 Tenant Home (12: default/loading/error/success/empty no requests/empty no unit), N2 Landlord Home (8), VARIANT Q5 N2 (2), U5 Admin Dashboard (10 incl. zeros, drawer open), U7 My jobs (10).
Foundations gaps: unit card, warning callout, property card, worker job row (local, List Row has one context line), date group label, portfolio strip, stat tile skeleton,
List Row Phone empty status row takes 22px (hidden by override), List Row Desktop truncates in 400px column (used Phone layout), nav count badges not props.
IMPORTANT: prelude tint() after icon swap inside an instance rendered black (paint base 0,0,0) — agent re-tinted with resolved colour. Other pages may show black icons in State/Empty after swap.
Judgment: N2 sample data conflict (Maple Court "1 open request" vs 3 open in dataset) — activity list trimmed to Kitchen faucet + Bathroom fan. "Message us" buttons added on N2 empty and N1 no-unit.
Known: nav unread badges are component defaults. 28:35844 and 28:37434 not re-shot after a one-line copy change.

## Request — page 20:76 — DONE, 72 frames, 9 rows
Rows: N3 Admin (12: default/loading/error/not available/success/action failed), N3 Admin other statuses (New, Completed), N3 Admin short dialogs (assign&schedule, put on hold, mark completed),
N3 Worker (12), N3 Tenant (10), N3 Landlord (10), U10 Tenant (10), VARIANT Q5 U10 landlord (2), New request dialog admin (6).
Foundations gaps: photo thumbnail + add tile, page skeleton, "Messages closed" bar (composer has no read-only), emergency inline notice, date field (Text), bottom sheet,
Timeline Message header doesn't wrap at 390, List Row Phone status line doesn't wrap (On hold / Completed long next steps clip ~24px at 390), Button icon swap needs manual tint, Field Error w/ empty value.
Judgment: worker cannot add photos; landlord thread separate card; Q5 variant keeps "OK to enter if I'm not home" (odd for landlord); New request dialog has 8 fields (brief's list).
Known: ~27 frames only checked at overview scale. Scrim renders light.

## People — page 20:79, Board 25:3567 — STOPPED BEFORE FINISHING, 85 frames, no final check, no report
Built rows: N7 People container (6 slots incl. a spec slot and drawer open), U15 Approvals (14), U13 Tenants tab (12), U13 Tenant add/edit form (7),
U13 Tenant page (8), U14 Landlords tab (14), U14 Landlord add/edit form (5), N8 Team tab (14), N8 Team member add/edit (5).
MISSING: U16 Vendors tab entirely (list, add/edit dialog, states). Icon-colour fix may not have been applied on this page.

## Lists — page 20:80, Board 25:4709 — STOPPED BEFORE FINISHING, 99 frames, no final check, no report
Built rows: U6 Maintenance queue (12) + other tabs (3 desktop), U8 Tenant Requests (14), U9 Landlord Maintenance (12), VARIANT Q5 U9 (2),
U11 Properties admin (12) and landlord (8), U12 Property page admin (10) + other tabs (6), U12 landlord (8) + other tabs (6),
U17 Documents tenant (2, default only), U17 Documents landlord (2, default only), N9 Admin Documents (2, default only).
MISSING: states for U17 tenant and landlord; states for N9; N9 Upload dialog (desktop + phone). Icon-colour fix may not have been applied on this page.
