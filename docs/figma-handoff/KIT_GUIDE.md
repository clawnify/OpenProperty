# Screen-page guide (step 2) — Landlord Gopher UPGRADED mockups

Figma file key `mx94NqyGDpnrTbilEWx3cr` · session id `d45bbf2c-5343-4dc3-82a4-0fd6635fdb4e` (pass as `sessionId` on every Figma call).
Design brief (read the sections named in your task, plus all of section 2):
`docs/figma-handoff/UX_UI_DESIGN.snapshot.md`
Script prelude (tested; paste it at the top of every script, set PAGE_ID):
`docs/figma-handoff/prelude.js`

## Setup, once
1. `ToolSearch` with `select:mcp__Figma__use_figma,mcp__Figma__get_figma_skill,mcp__Figma__get_screenshot`.
2. `mcp__Figma__get_figma_skill` with `skill://figma/figma-use/SKILL.md` (mandatory before use_figma). Pass
   `skillNames: "resource:figma-use,resource:figma-generate-design"` on every use_figma call.
3. Read prelude.js and this guide fully. Do not call create_session; reuse the session id above.

## Hard rules
- Work ONLY on your own page (id in your task). Never edit `UPGRADED — Foundations` (8:99) or any other page.
- Use ONLY Foundations component instances, LG variables, LG text styles and LG effect styles. Plain auto-layout frames and
  text are fine as containers when bound to those variables and styles (the prelude helpers do this). No hardcoded colours.
  If something you need does not exist, build it locally from the variables/styles and list it under "Foundations gaps" in your report.
- Never use paint opacity on a variable-bound fill. Use a variable (`overlay`, `muted`, `tab-active`, …).
- Always set text props explicitly with `setP` (variants share one default). `setP` throws on an unknown prop name: fix the name, don't guess.
- A failed use_figma script is rolled back atomically: fix and resend. Return node ids from every script.
- One page switch per script (the prelude does it). Keep each script to a few screens (about 3–6 frames); scripts cap at 50,000 characters.
- Every frame goes through `row()` + `slot()` so nothing overlaps and nothing is left loose on the page. `shell()` clones a
  template onto your page: always `slot()` it in the same script.
- Screenshots: `await node.screenshot({scale: 0.5})` inside use_figma, or get_screenshot with `enableBase64Response: true`.
  Figma asset URLs cannot be downloaded from this machine.
- Do not spawn further agents. Do not touch the git repository.

## Screen sizes and page layout
- Desktop frame 1440 × 900 (`shell('desktop', …)`: `Sidebar` 275 + `Main` > `Header`, `Content`). Let a frame grow taller than 900 if
  content needs it (set the frame's vertical sizing to hug) rather than clipping.
- Phone frame 390 × 844 (`shell('phone', …)`: `Header`, `Content`, `Sticky action`, `Tab bar`; `shell('form', …)`: `Header`, `Content`, `Sticky action`).
- One `row('<ID> — <Screen> · <variant>', '<one-line note>')` per screen variant; inside it slots labelled
  `Desktop · Default`, `Phone · Default`, `Desktop · Loading`, … Name each screen frame `<ID> · <Screen> · <Role> · Desktop|Phone · <State>`.
- Section 2.6 on phone: single column; bottom tabs for tenant, landlord, worker; admin uses `Header / Phone` Type=Admin and NO tab bar
  (remove the `Tab bar` child); the primary action is a full-width `Sticky Action Bar` at the bottom, not in the header; forms are full
  screen with a sticky submit bar; tap targets ≥ 44 px (use Size=Large / Size=Phone variants on phone).
  Detail screens on phone use `Header / Phone` Type=Back and no tab bar.
- Desktop header: one primary action at most (`Show action` false when the page has none). Set `Account name` and the `Avatar` initials
  to the role's person. Sidebar: `swap(sub(frame,'Sidebar'),'Sidebar',{Role, Active})`.

## States (section 2.5) — required for every list and page, at BOTH widths
For each screen: `Default`, then `Loading` (State / Loading or List Row Skeleton rows in the shape of the content — never "Loading…" text),
`Empty` (State / Empty: icon, one sentence saying what will appear, primary action only if the user can create the first item),
`Filtered empty` (State / Filtered Empty — ONLY where the screen has tabs, filters or search), `Error` (State / Error with Retry, in place
of the content), `Success` (the default screen with `Banner / Success`, one line, floated bottom-centre: desktop 520 wide; phone 358 wide
above the tab bar or action bar). A failed action uses `Banner / Error`. State frames keep the shell (sidebar/header/tabs) and replace only the content.
Screens that are not lists (forms, auth pages) still need loading/error/success where they apply (e.g. field error state, submit success);
say in your report which states you judged not applicable and why.

## Section 2.3 / 2.4 checklist (the reviewer checks these)
- Status labels only: New, Assigned, In progress, On hold, Completed. Never Open / Scheduled / Closed.
- Priority badge only for Emergency and High.
- A status badge is followed by its next step in words where there is one (use `Status Line`): "Assigned · Tue 17 Nov · Sam Fixit",
  "On hold · waiting for part · follow-up Fri 20 Nov".
- Read-only information is text (`Read-only Field`: label above, value below), never disabled inputs.
- Anything clickable is a `Button`, `Link`, `Icon Button`, `List Row`, `Tab`, `Menu Item` or `Stat Tile`; show one Focus-state example per screen row where practical.
- People by name, role as secondary text ("Sam Fixit · Maintenance") — use `Person`.
- Dates: relative when recent ("Today 2:14 pm", "Yesterday"), absolute otherwise ("Tue 17 Nov").
- Dialogs only for short tasks (≤ about 6 fields, no scrolling); anything longer is a page.
- Lists use `List Row` (title, one line of context, status on the right; whole row clickable).

## Decisions (section 8) — design as written
Q1 yes: leasing, rent, applications and rent policy are gone (no rent/lease content anywhere).
Q2 yes: New / Assigned / In progress / On hold / Completed.
Q4 no: a landlord sees status entries and their own thread only, not the tenant conversation.
Q5: draw the landlord "Report an issue" button and the landlord submit form ONLY as separate rows whose title starts with
"VARIANT (Q5, not approved) —". The main landlord screens do not have the button.
Q6 no: each tenant sees only their own requests. Q7 no: no "Notifications on this device" toggle.

## Shared sample data (use exactly, so pages agree). Today is Mon 16 Nov 2026.
- Product name "Landlord Gopher". Office contact (placeholder): (410) 555-0134 · help@landlordgopher.example. Emergency line copy: "For fire, gas or flooding call 911 first."
- Admin: Ada Admin (AA), role "Admin", shown to others as "Ada Admin · Landlord Gopher".
- Worker: Sam Fixit (SF), role "Maintenance", job title "Maintenance technician". Second team member: Maya Cole (MC), "Office coordinator".
- Tenant: Tina Renter (TR), Unit 1A · Maple Court, 12 Maple St, Baltimore. Other tenants: Raj Patel (RP) Unit 1B · Maple Court; Omar Tenant (OT) Unit 2 · Cedar Flats.
- Landlord: Lena Owner (LO) owns Maple Court (2 units, 2 occupied, 1 open request, last activity today) and Birch House, 48 Birch Ave
  (1 unit, vacant, no open requests, last activity 3 Nov). Second landlord: Paul Landry (PL) owns Cedar Flats, 9 Cedar Rd (4 units).
- Vendors: Bright Plumbing Co. (3 jobs), Harbor Electric (1 job).
- Requests:
  - #MR-001000 Kitchen faucet leaking · Unit 1A · Maple Court · reported by Tina Renter, Sat 14 Nov · Category Plumbing ·
    Description "Drips constantly, even when fully closed. Getting worse." · Entry "OK to enter if absent" · priority High ·
    Assigned · Tue 17 Nov · Sam Fixit. Timeline: Tina Renter reported this (Sat 14 Nov) → Ada Admin assigned Sam Fixit, scheduled Tue 17 Nov →
    Sam Fixit · Maintenance: "Need a part, back tomorrow." → Tina Renter: "Thanks!". Internal note (staff only): "Cartridge on order from Bright Plumbing."
  - #MR-001004 No heat in unit · Unit 2 · Cedar Flats · Omar Tenant · Emergency · New, 20 min ago, not assigned yet.
  - #MR-000998 Hallway light out · Maple Court · Common area (no unit) · reported by Ada Admin · In progress · started today · Sam Fixit.
  - #MR-000995 Boiler making noise · Birch House · Whole property · On hold · waiting for part · follow-up Fri 20 Nov.
  - #MR-000990 Bathroom fan not working · Unit 1B · Maple Court · Raj Patel · Completed Fri 13 Nov · "Replaced the fan motor".
  - Tenant Tina's own second request: #MR-001002 Bedroom window won't close · New · reported today 2:14 pm.
- Counters (admin): 2 awaiting approval · 7 new requests to assign · 1 emergency open · 3 unread messages. Portfolio: 31 properties · 80 units · 74 occupied · 6 vacant.
- Pending approvals: Nora Quinn, nora.quinn@example.com, says "Tenant", address given "12 Maple St, Unit 1B", email confirmed;
  Greg Marsh, greg.marsh@example.com, says "Property owner", address given "48 Birch Ave", email not confirmed yet.
- Messages: Tina ↔ Landlord Gopher about Unit 1A: Tina "Hi, is the laundry room open on Sunday?" 10:02 → Ada Admin "Yes, 8 to 8." 10:15.
  Lena Owner conversation about Maple Court (Yesterday). Request thread: Kitchen faucet · 1A, Sam: "Need a part, back tomorrow."
- Documents: Lease 2026.pdf (Unit 1A, shared with tenant and landlord, 2.1 MB, uploaded 3 Jan by Ada Admin); House rules.pdf (Maple Court, whole property);
  Boiler service report.pdf (Birch House, landlord only).

## Components (name → variant axes / props). Use `I(name, {all axes})`, `setP(inst, {props})`, `sub(inst, 'Nested name')`.
Navigation
- Sidebar: Role=Tenant|Landlord|Worker|Admin, Active=<item label>. Bottom Tab Bar: Role=Tenant|Landlord|Worker, Active=<item label>.
- Admin Drawer: Active=Dashboard|Maintenance|Properties|People|Messages|Documents (304 wide; float over `overlay(frame)`).
  Items — Tenant: Home, Requests, Messages, Documents. Landlord: Home, Properties, Maintenance, Messages, Documents. Worker: My jobs, Messages.
  Admin: Dashboard, Maintenance, Properties, People, Messages, Documents.
Header
- Header / Desktop: props Title, Meta, Show meta, Show action, Account name. Nested: `Primary action` (Button), `Notifications` (Icon Button, prop Dot), `Avatar` (prop Initials).
- Header / Phone: Type=Root|Admin|Back|Close. Props Title, Trailing, Show trailing. Nested `Notifications`, `Avatar` (Root/Admin only).
- Account Menu: Size=Desktop|Phone. Props Name, Role.
Status
- Status Badge: Status=New|Assigned|In progress|On hold|Completed. Priority Badge: Priority=Emergency|High.
- Status Line: Status=(same five). Props Next step, Show next step.
- Count Badge: Type=Count|Dot; prop Count (Count type). Badge: Tone=Neutral|Info|Success|Warning|Destructive|Brand|Outline; prop Label.
  Portal status: Not invited=Neutral, Pending approval=Warning, Active=Success, Suspended=Destructive. Chip: prop Label.
Rows and patterns
- List Row: Layout=Desktop|Phone, State=Default|Hover|Focus. Props Title, Context, Unread, Show icon, Icon, Show priority, Show status, Show meta, Meta, Show chevron.
  Nested `Status` (Status Line), `Priority` (Priority Badge). Prefer the prelude's `mkRow`.
- List Row Skeleton: Layout=Desktop|Phone. Section Header: props Title, Show action; nested `Action` (Link, prop Label).
- Stat Tile: State=Default|Zero|Focus; props Value, Label. Read-only Field: props Label, Value.
- Person: Layout=Inline|Stacked; props Name, Role, Show avatar, Show role; nested `Avatar`.
- Dialog Header: props Title, Description, Show description. Dialog Footer: nested `Cancel`, `Confirm` (Buttons, prop Label).
- Message Composer: Audience=Default|Staff, Size=Desktop|Phone; prop Placeholder; nested `Send`, and `Internal only` (Staff).
- Message Bubble: Side=Theirs|Mine; props Sender, Show sender, Text, Time.
- Timeline Event: props Text, Time. Timeline Message: Visibility=Everyone|Internal; props Name, Role, Time, Text; nested `Avatar`.
States
- State / Loading: Layout=Desktop|Phone. State / Empty: Layout; props Icon, Message, Show action; nested `Action` (Button).
- State / Filtered Empty: Layout; props Icon, Message; nested `Clear filter`. State / Error: Layout; props Icon, Message; nested `Retry`.
- Banner / Success, Banner / Error: prop Message (520 wide; resize to 358 on phone).
Phone
- Sticky Action Bar: Actions=One|Two, Inset=None|Safe area; nested `Primary`, `Secondary` (Buttons, prop Label).
Primitives
- Button: Variant=Primary|Secondary|Ghost|Destructive|Link, Size=Default|Large, State=Default|Focus|Disabled. Props Label, Leading icon, Icon, Trailing icon, Trailing.
- Icon Button: Size=Default|Large, State=Default|Hover|Focus; props Icon, Dot. Avatar: Size=Small|Medium|Large; prop Initials.
- Field: Type=Text|Select|Textarea, Size=Desktop|Phone, State=Placeholder|Filled|Focus|Error. Props Label, Show label, Value, Hint, Show hint.
- Search Field: Size=Desktop|Phone; prop Placeholder. Checkbox: Size=Desktop|Phone, State=Unchecked|Checked; prop Label.
- Radio: Size=Desktop|Phone, State=Unselected|Selected; prop Label. Switch: State=Off|On; props Label, Show label.
- Tab: State=Default|Active; props Label, Show count, Count. Tab List: Tabs=2|3|4|5; nested `Tab 1`…`Tab n` (setP Label; swap State to move the active tab).
- Link: State=Default|Focus; props Label, Back chevron. Menu Item: Size=Default|Large, Tone=Default|Destructive, State=Default|Hover|Focus; props Label, Show icon, Icon.
- Icons (IC[name], `icon(name,size,colourVar)`): house, list-checks, message-square, file-text, building-2, users, layout-dashboard, bell,
  chevron-down, chevron-right, chevron-left, menu, x, plus, search, log-out, circle-user, inbox, search-x, triangle-alert, circle-check,
  refresh-cw, wrench, camera, image, paperclip, calendar, clock, lock, send, ellipsis, filter, check, phone, mail, upload, trash-2, pencil,
  eye, eye-off, map-pin, key-round, circle-alert, settings, user, info.

## Variables and styles
Colour: background, foreground, card, muted, muted-foreground, faint, border, input, primary, primary-foreground, secondary, accent,
brand, brand-tint, brand-text, on-brand, ring, info(-tint,-solid), success(-tint,-solid), warning(-tint,-solid), destructive(-tint,-solid),
sidebar, sidebar-border, sidebar-accent, sidebar-hover, tab-active, overlay.
Radius: radius-xs 4, radius-sm 8, radius-md 12, radius-lg 16, radius-xl 24. Text styles: see T() in the prelude. Effects: Raised, Float, Solid.
Recipes: Card = `card()`; content card padding 20; row-list card padding 0. Table: header cells 44 high, px 12, Label muted-foreground;
body cells 44 high, px 12, Small; row bottom border. Desktop Content padding 24 / gap 24; phone Content padding 16 / gap 16.

## Working method
1. Read the brief sections for your screens. Plan the rows and frames (list them first).
2. Build screen by screen: default desktop + phone, screenshot, fix clipped/overlapping/truncated content, then the state frames
   (clone your finished default with `frame.clone()`, `slot()` it, replace the content).
3. Before reporting, screenshot your whole Board once at low scale and check nothing is loose, clipped or overlapping.

## Report back (final message, plain text)
- Rows and frames built: `row title` → frame names with node ids.
- States judged not applicable, with the reason.
- Foundations gaps (anything you had to build locally) and judgment calls where the brief was silent or contradictory.
- Anything unfinished or known-wrong. Be exact; do not claim a frame you did not screenshot.
