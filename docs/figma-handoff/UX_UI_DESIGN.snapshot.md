# Landlord Gopher — UX/UI Design: Screens to Add, Update and Delete

**Date:** 2026-11-14 · **Status:** design proposal, awaiting approval · **Companion to:** [`LANDLORD_GOPHER_AUDIT_AND_PLAN.md`](LANDLORD_GOPHER_AUDIT_AND_PLAN.md) (findings are cited as F-nn, tasks as n.n, open decisions as Qn)

This is the screen-level design brief. It says what each screen is for, what is on it, and how it behaves — enough for an engineer to build it and for the owner to picture it. It does not change scope: everything here traces to a finding in the audit.

## 1. At a glance

| | Count | Screens |
|---|---|---|
| **New** | 9 | Tenant Home · Landlord Home · Request page · Messages · Notifications · Account · People (container) · Team · Admin Documents |
| **Update** | 17 | Sign in/up · Reset password · Blocked pages · App shell and navigation · Admin dashboard · Maintenance queue · Worker jobs · Tenant requests · Landlord maintenance · Submit request form · Properties list · Property page · Tenant records · Landlord records · Approvals · Vendors · Documents (tenant, landlord) |
| **Delete** | 7 | Leases · Rent ledger · Rental applications · Settings · Calendar page · Work-order and request-details dialogs · Placeholder pages |
| **No change** | 3 | Property dialog · Unit dialog · Property documents panel |

Design principle for the whole pass: **each role opens the app to the thing they came to do, and reaches everything else in one tap.** A tenant came to report or check a problem. A landlord came to see how their properties are doing. A worker came to see today's jobs. An admin came to see what needs a decision.

## 2. Foundations (apply to every screen)

These are decided once so individual screens do not re-decide them.

### 2.1 Navigation by role

| Role | Items (in order) | Phone |
|---|---|---|
| Tenant | Home · Requests · Messages · Documents | Bottom tab bar, 4 tabs |
| Landlord | Home · Properties · Maintenance · Messages · Documents | Bottom tab bar, 5 tabs |
| Worker | My jobs · Messages | Bottom tab bar, 2 tabs |
| Admin | Dashboard · Maintenance · Properties · People · Messages · Documents | Top bar with menu button opening a drawer |

- Every item is always visible, including the home item. Today the home item is hidden behind the product title (F-08).
- Count badges: Messages shows unread; admin People shows accounts awaiting approval; admin Maintenance shows new unassigned requests.
- Desktop keeps the existing left sidebar (width, colours and type unchanged).

### 2.2 Header

Left: page title and a short count or context line (existing `PageShell` pattern). Right: the page's one primary action, a notification bell, and an account menu (name, role, Account, Sign out). The email address, role chip and "Read-only" chip that sit in the header today are removed; the account menu carries that information.

### 2.3 Status and priority language

One vocabulary on every screen and for every role (pending Q2). Stored values do not change.

| Stored value | Label shown | Tone (existing token) | Meaning in plain words |
|---|---|---|---|
| Open | **New** | `info-tint` / `info` | Received, nobody assigned yet |
| Scheduled | **Assigned** | `brand-tint` / `brand-text` | Someone is assigned and a date is set |
| In Progress | **In progress** | `warning-tint` / `warning` | Work has started |
| On Hold | **On hold** | `muted` with border | Waiting on something; shows the reason |
| Closed | **Completed** | `success-tint` / `success` | Done; shows what fixed it |

Priority is shown only when it matters: **Emergency** (`destructive-tint`) and **High** (`warning-tint`). Normal and low get no badge, which removes a badge from most rows.

A status badge is always accompanied by the next step in words where there is one: "Assigned · Tue 17 Nov · Sam Fixit", "On hold · waiting for part · follow-up Fri 20 Nov".

### 2.4 Patterns

- **Read-only information is text, not disabled inputs.** Label above, value below. Disabled inputs are used only for a field that is temporarily unavailable.
- **Anything clickable is a link or a button**, reachable by keyboard, with a visible focus ring (`--ring`).
- **People are shown by name**, with their role as secondary text: "Sam Fixit · Maintenance".
- **Dates** are relative when recent ("Today 2:14 pm", "Yesterday") and absolute otherwise ("Tue 17 Nov").
- **Dialogs are for short tasks** (up to about six fields, no scrolling). Anything longer is a page.
- **Lists** use one row component: title, one line of context, status on the right, whole row clickable.

### 2.5 States every list and page must define

| State | Treatment |
|---|---|
| Loading | Skeleton rows in the shape of the content; no centred "Loading…" text |
| Empty, first use | Icon, one sentence saying what will appear here, and the primary action if the user can create the first item |
| Empty, filtered | "Nothing matches this filter" with a Clear filter link |
| Error | Inline message in place of the content with a Retry button; the existing red banner is kept for failed actions |
| Success | Existing green notice, one line, auto-dismiss |

### 2.6 Phone layout

Tenants, landlords and workers are assumed to be on a phone most of the time. Single column, bottom tabs, primary action as a full-width button at the bottom of the screen, forms full-screen with a sticky submit bar, tap targets at least 44 px. Admin screens must work on a phone but are designed for desktop first.

---

## 3. New screens

Wireframes show layout and content order only; names and figures in them are illustrative.

### N1 — Tenant Home

- **Who / route:** tenant · `/home` (landing screen)
- **Purpose:** answer "what is happening with my place?" and make reporting a problem the obvious action.
- **Replaces:** landing directly on the request list.

```
┌──────────────────────────────────────────────┐
│ Unit 1A · Maple Court                        │
│ 12 Maple St, Baltimore                       │
├──────────────────────────────────────────────┤
│ [  Report a problem  ]                       │
├──────────────────────────────────────────────┤
│ Your open requests                  View all │
│  Kitchen faucet leaking                      │
│  Assigned · Tue 17 Nov · Sam Fixit        ›  │
├──────────────────────────────────────────────┤
│ Messages                            View all │
│  Landlord Gopher · Yesterday              ●  │
│  "We'll have someone out Tuesday…"        ›  │
├──────────────────────────────────────────────┤
│ Documents                           View all │
│  Lease 2026.pdf                           ›  │
└──────────────────────────────────────────────┘
```

- **Content:** unit card; primary button; up to three open requests with status and next step; latest message with unread dot; two most recent documents.
- **Empty states:** no open requests → "Nothing open. Report a problem if something needs fixing." No unit linked → a warning card replaces the button: "Your account isn't linked to a unit yet. Message us and we'll sort it out."
- **Actions:** Report a problem (opens the submit form, U10); tap a request → Request page (N3); tap message → Messages (N4).

### N2 — Landlord Home

- **Who / route:** landlord · `/home` (landing screen)
- **Purpose:** show the state of every property without opening each one.

```
┌───────────────────────────┬──────────────────────────┐
│ Maple Court               │ Birch House              │
│ 2 units · 2 occupied      │ 1 unit · 1 vacant        │
│ 1 open request            │ No open requests         │
│ Last activity: today      │ Last activity: 3 Nov     │
├───────────────────────────┴──────────────────────────┤
│ Maintenance activity                        View all │
│  Kitchen faucet leaking · Maple Court 1A             │
│  In progress · started today                      ›  │
├──────────────────────────────────────────────────────┤
│ Messages                                    View all │
│  Landlord Gopher · Maple Court · Yesterday        ●  │
└──────────────────────────────────────────────────────┘
```

- **Content:** one card per property (units, occupied/vacant, open request count, last activity); recent maintenance activity across all properties; latest message per property.
- **Actions:** tap property → Property page (U12); tap request → Request page; "Report an issue" button appears here if Q5 is approved.
- **Empty state:** no properties linked → "No properties are linked to your account yet. Message us."

### N3 — Request page

- **Who / route:** all roles · `/maintenance/:id`
- **Purpose:** the single place where a job is understood, discussed and moved forward.
- **Replaces:** the "Edit work order" dialog (1,580 px tall, 16 inputs) and the "Request details" dialog (F-10).

```
‹ Maintenance                                    #MR-001000
Kitchen faucet leaking                 [Assigned] [Emergency]
Unit 1A · Maple Court · Reported by Tina Renter, 14 Nov
┌──────────────────────────────────────┬─────────────────────┐
│ Details                              │ ACTIONS             │
│  Category      Plumbing              │ (differs by role,   │
│  Description   Drips constantly…     │  see below)         │
│  Entry         OK to enter if absent │                     │
│  Assigned to   Sam Fixit             │                     │
│  Scheduled     Tue 17 Nov            │                     │
│                                      │                     │
│ Photos  [▢][▢][+]                    │                     │
│                                      │                     │
│ Timeline                             │                     │
│  ● Tina Renter reported this · 14 Nov│                     │
│  ● Ada Admin assigned Sam Fixit,     │                     │
│    scheduled Tue 17 Nov              │                     │
│  💬 Sam Fixit · Maintenance          │                     │
│     Need a part, back tomorrow.      │                     │
│  💬 Tina Renter                      │                     │
│     Thanks!                          │                     │
│ ┌──────────────────────────────────┐ │                     │
│ │ Write a message…          [Send] │ │                     │
│ └──────────────────────────────────┘ │                     │
└──────────────────────────────────────┴─────────────────────┘
```

- **Header:** back link, request number, title, status, priority, location, who reported it and when.
- **Details:** plain text. Assigned person and scheduled date are visible to everyone on the request, including the tenant (missing today).
- **Photos:** thumbnails that open full size; an add tile while fewer than five; remaining count shown.
- **Timeline:** one chronological list mixing status changes and messages, each with a name. Status changes are written as sentences ("Ada Admin assigned Sam Fixit"), not "Open → Scheduled". Internal notes appear inline for staff only, on a tinted background labelled "Internal — not visible to tenant or landlord".
- **Message box:** at the bottom of the timeline. For staff, a single switch "Internal only" (off by default) replaces the visibility dropdown. Read-only once the request is completed, with a "Reopen" action for admins.

**Actions panel by role**

| Role | Actions | Notes |
|---|---|---|
| Admin | **Assign and schedule** (person + date) when New · Change status · Vendor · Cost · Edit details · Delete | Assign and schedule is the primary button on a New request. Changing to On hold asks for reason and follow-up date; to Completed asks "What fixed it?" — asked at that moment, in a small dialog, not as permanent fields |
| Worker | **Start work** → **Complete** (one primary button that advances) · Put on hold · Cost | Cannot reassign or reschedule |
| Tenant | Add photos · Send message | No panel on phone; actions sit under the details |
| Landlord | Send message to Landlord Gopher | Sees status, details, photos and their own thread (pending Q4) |

- **Phone:** single column; actions panel collapses to a sticky bar with the primary action; message box sticks to the bottom.
- **States:** request not found or not permitted → "This request isn't available" with a link home (never a blank page).

### N4 — Messages

- **Who / route:** all roles · `/messages` and `/messages/:id`
- **Purpose:** talk to Landlord Gopher about a unit or property outside a specific job, and find any conversation that needs a reply.

```
┌──────────────────────────┬───────────────────────────────────┐
│ [All] [Unread]           │ Maple Court · Unit 1A             │
│ Search or filter by      │ Tina Renter · Tenant              │
│ property                 ├───────────────────────────────────┤
│                          │           Hi, is the laundry room │
│ ● Maple Court · 1A       │           open on Sunday?  10:02  │
│   Tina: Is the laundry…  │                                   │
│   10:02                  │ Ada Admin · Landlord Gopher       │
│                          │ Yes, 8 to 8.              10:15   │
│   Maple Court            │                                   │
│   Lena Owner (landlord)  │                                   │
│   Yesterday              ├───────────────────────────────────┤
│                          │ Write a message…           [Send] │
│ 🔧 Kitchen faucet · 1A   │                                   │
│   Sam: Need a part…      │                                   │
└──────────────────────────┴───────────────────────────────────┘
```

| Role | Conversation list contains |
|---|---|
| Tenant | One conversation with Landlord Gopher about their unit, plus their requests that have messages |
| Landlord | One conversation per property, plus their request threads |
| Worker | Request threads for assigned jobs only |
| Admin | Everything; filter by property, by tenant/landlord, and Unread |

- Request threads carry a wrench marker and open the Request page at the timeline, so a job's discussion lives in one place.
- Tenants and landlords with a single conversation skip the list and open straight into it.
- **Phone:** list and thread are separate screens.
- **Empty state:** "No messages yet. Write to us any time." with the message box ready.

### N5 — Notifications

- **Who / route:** all roles · bell in the header (panel), no separate nav item
- **Purpose:** show what changed since the user last looked.
- **Content:** newest first; each item is one sentence with a time and links to the request or conversation — "Your request *Kitchen faucet leaking* was assigned to Sam Fixit", "New request at Maple Court 1A", "Your account was approved". Unread items have a dot; "Mark all read" at the top.
- **Empty state:** "You're all caught up."
- **Phone:** opens as a full-screen sheet.

### N6 — Account

- **Who / route:** all roles · `/account`, reached from the account menu
- **Purpose:** the "manage their account" requirement, which has no screen today (F-04).
- **Sections:** Profile (name, phone; email shown, not editable) · Password (current, new) · Notifications (email on/off per event type; admins also get "Alert me about new requests") · Sign out.
- A short page, one column, saved per section.

### N7 — People (container)

- **Who / route:** admin · `/people`, with tabs
- **Purpose:** one place for everyone the business deals with, instead of four separate destinations (Landlords, Tenants, Users, Settings → Vendors).
- **Tabs:** **Approvals** (count badge) · Tenants · Landlords · Team · Vendors.
- Opens on Approvals when anything is waiting, otherwise on Tenants.
- A person's row shows their portal status as a small chip: "Not invited", "Pending approval", "Active", "Suspended". This connects the record to the login, which today are on different screens.

### N8 — Team (tab in People)

- **Who:** admin
- **Purpose:** add and manage Landlord Gopher staff and maintenance workers. No screen exists today; adding a worker needs the SQL editor (F-06).
- **List:** name, job title, phone, email, portal status, open jobs assigned, "Gets new-request alerts" toggle.
- **Add/edit dialog:** first name, last name, email, phone, job title, alerts toggle.
- **Row actions:** Edit · Suspend/Reactivate login.
- **Empty state:** "Add the people who do the work so requests can be assigned to them." [Add team member]

### N9 — Admin Documents

- **Who / route:** admin · `/documents` (blank page today, F-08)
- **Purpose:** find or add any document without first navigating to its property.
- **Content:** table — document, property, unit (or "Whole property"), shared with, uploaded by, date. Filters: property, shared with. Primary action: Upload (existing dialog, with a property picker added).
- **Wording:** the "visibility" control is relabelled **Shared with**: "Landlord Gopher only" · "Landlord" · "Tenant and landlord". Same three stored values.

---

## 4. Screens to update

### U1 — Sign in / Sign up

- **Problem:** signup collects email and password only; the admin cannot tell who the person is, and unknown emails are filed as maintenance workers (F-06). Title reads "LG Maintenance Portal" for everyone.
- **Change:** title "Landlord Gopher". Signup adds full name, "I am a… Tenant / Property owner", and for tenants an optional "Your address or unit". Confirmation copy: "Check your email to confirm your address. We'll then review your account — usually within one business day — and email you when it's ready."
- **Keep:** layout, forgot-password link, error placement.

### U2 — Reset password

- **Problem:** the new-password form never appears for tenants, landlords and workers (F-01).
- **Change:** the form always shows after the emailed link. Add a confirm-password field and a show/hide toggle. On success: "Password updated" then the role's home.

### U3 — Blocked pages (pending, rejected, suspended, no role)

- **Problem:** technical wording, including a database command shown to end users.
- **Change:** one friendly page per situation. Pending: "Thanks for signing up. We're reviewing your account and will email you when it's ready." with Check again and Sign out. Suspended/rejected: "This account isn't active. Contact Landlord Gopher at …". Remove all references to SQL, rows and links.

### U4 — App shell and navigation

- **Problem:** F-08.
- **Change:** as in sections 2.1 and 2.2. One portal name for all roles; role is visible in the account menu.

### U5 — Admin Dashboard

- **Problem:** leads with occupancy and rent; no approvals, upcoming work or activity; rows not clickable (F-09).

```
┌───────────────┬───────────────┬───────────────┬───────────────┐
│ 2             │ 7             │ 1             │ 3             │
│ Awaiting      │ New requests  │ Emergencies   │ Unread        │
│ approval      │ to assign     │ open          │ messages      │
├───────────────┴───────────────┴──┬────────────┴───────────────┤
│ Open requests           View all │ Upcoming · next 14 days    │
│  Kitchen faucet · Maple Ct 1A    │ Tue 17 Nov                 │
│  New · 2 h ago                 › │  Sam Fixit · faucet · 1A   │
│  No heat · Birch House           │ Fri 20 Nov                 │
│  Emergency · New · 20 min      › │  Follow-up · boiler part   │
├──────────────────────────────────┴────────────────────────────┤
│ Recent activity                                               │
│  Sam Fixit started Kitchen faucet leaking · 10:40             │
│  Tina Renter sent a message · 10:02                           │
│  Lease 2026.pdf uploaded to Maple Court · Yesterday           │
├───────────────────────────────────────────────────────────────┤
│ 31 properties · 80 units · 74 occupied · 6 vacant             │
└───────────────────────────────────────────────────────────────┘
```

- **Remove:** Outstanding rent, Active leases, This month's rent, Lease expirations.
- **Add:** four "needs attention" counters, each opening the matching filtered list; open requests ordered emergency first, then oldest; Upcoming (replaces the calendar page); recent activity feed; portfolio strip.
- A counter at zero is shown muted, not hidden, so the layout never shifts.

### U6 — Maintenance queue (admin)

- **Problem:** seven status tabs, two-column cards with long descriptions, no way to narrow by property or person.
- **Change:** tabs reduced to **Needs action** (New + On hold with follow-up due) · **Active** (Assigned + In progress) · **Completed** · **All**. Add filters for property and assignee, and a search box (title or request number). Rows instead of cards: title, location, tenant, status with next step, age. "New request" stays as the primary action and opens a short dialog (title, property, unit, tenant — pre-filled from the unit — category, priority, description, photos). Tapping a row opens the Request page.

### U7 — Worker "My jobs"

- **Problem:** workers get the admin's queue with admin tabs.
- **Change:** sections **Today** · **Upcoming** · **On hold** · **Recently completed**, ordered by scheduled date. Each row: title, address and unit, tenant name, entry permission, scheduled date. No tabs. Tapping opens the Request page with "Start work" as the primary button.
- **Empty state:** "No jobs assigned right now."

### U8 — Tenant Requests

- **Problem:** this is currently the tenant's entire app; status wording differs between list and detail (F-07).
- **Change:** becomes the Requests tab. Tabs **Open** · **Completed**. Rows show status with next step. "Report a problem" stays as the primary action. Uses the shared status labels.

### U9 — Landlord Maintenance

- **Problem:** read-only list; property-level requests missing (F-05).
- **Change:** rows grouped or filterable by property; includes requests with no unit; "Report an issue" button if Q5 is approved. Remove the "Read-only" chip — what the landlord can do is evident from the buttons present.

### U10 — Submit request form

- **Problem:** works well; cramped as a dialog on phones; "Title" is an awkward first question.
- **Change:** full-screen on phones with a sticky Submit bar. Field order: **What's the problem?** (short summary) · Category · Details · Photos (camera or library, up to five, with count) · "This is an emergency" · "OK to enter if I'm not home". Emergency selection shows a line: "For fire, gas or flooding call … first."
- **Landlord variant (Q5):** adds a Property and Unit picker at the top; unit optional for common areas.

### U11 — Properties list

- **Change:** each card adds open-request count and an unread-message dot. Admin gets a search box and landlord filter. Otherwise unchanged.

### U12 — Property page

- **Problem:** units show bedrooms and market rent but not who lives there or what is open; "Market rent" total is a leasing figure.
- **Change:** summary tiles become Units · Occupied · Open requests · Unread messages (drop Market rent). Each unit card shows tenant name(s) and open-request count; market rent moves into the unit dialog. Sections become tabs: **Units** · **Requests** · **Messages** · **Documents**. Landlords see the same page without edit actions.

### U13 — Tenant records (People → Tenants)

- **Problem:** a tenant can only be attached to a unit by creating a lease; form asks for employer, income and date of birth (F-06, F-17).
- **Change:** list shows name, unit, phone, portal status. The form is: first name, last name, email, phone, **Unit** (property then unit picker), notes. Remove employer, monthly income, date of birth and emergency contact from the form and detail page (data is kept, see the audit). Tenant page shows: contact, unit, requests, conversation. Remove the lease history section.

### U14 — Landlord records (People → Landlords)

- **Change:** moves into People. List adds property count and portal status. Row opens a detail panel with their properties and conversation. Form unchanged.

### U15 — Approvals (People → Approvals, was Users)

- **Problem:** the queue shows an email, a role dropdown and a "Staff link" dropdown; the admin must already know who this is and understand record linking.
- **Change:** each pending card shows name, email, what they said they are, the address they gave, and whether their email is confirmed. The decision is one sentence with pickers: "Approve as **Tenant** of **Maple Court · Unit 1A**" / "as **Owner** of **Maple Court**" / "as **Team member**". Approving creates or links the underlying record in one step. Reject asks for an optional reason. Approved, rejected and suspended accounts move out of this tab and are managed from the person's row in Tenants, Landlords or Team.

### U16 — Vendors (People → Vendors, was Settings → Vendors)

- **Change:** moved, not redesigned. Remove the colour picker (it is not used meaningfully anywhere). Add "Jobs" count.

### U17 — Documents (tenant and landlord)

- **Change:** minor. Shared row layout with the admin page; group by "For your unit" and "For the building" (tenant) or by property (landlord); show upload date and size; consistent empty state.

---

## 5. Screens to delete

"Delete" here means the screen leaves the product. For the first four, the audit recommends switching them off first and removing the code after one release (task 2.2, then 3.6). **No database table is dropped and no data is deleted in any case.**

| # | Screen | Why it goes | What replaces it | Data affected | Before removing |
|---|---|---|---|---|---|
| D1 | **Leases** page and lease dialog | Leasing is outside the product's scope; maintenance does not need lease terms | Nothing. A lease *document* is uploaded under Documents | 0 live rows | U13 unit picker must ship first — today a lease is the only way to attach a tenant to a unit |
| D2 | **Rent ledger** and payment dialog | Accounting; explicitly out of scope | Nothing | 0 live rows | — |
| D3 | **Rental applications** page and dialog | Applicant screening with income data; out of scope and confused with account approvals | Nothing. Account approval lives in People → Approvals | 0 live rows | — |
| D4 | **Settings** page, including the **Rent policy** tab | Rent policy sets lease defaults only. Vendors moves to People. Nothing else is on the page | Personal settings → Account (N6). Alert recipients → Team (N8) | 4 rows of lease defaults remain in the database, unused | U16 |
| D5 | **Calendar** page | Four of its six date sources are leasing and rent; the rest is a short list | Dashboard "Upcoming" (U5) and dated sections in My jobs (U7) | None | U5 and U7 |
| D6 | **Edit work order** dialog and **Request details** dialog | Too long for a dialog; shows read-only data as disabled inputs; cannot be linked to | Request page (N3). A short "New request" dialog remains | None | N3 |
| D7 | **Placeholder pages** ("Tenant portal", "Landlord portal", "Assigned jobs", "Admins only") | Dead ends shown when a role lands on a route it cannot use | Redirect to the role's home; one shared "Page not found" with a Home button | None | U4 |

Also removed as parts of screens that remain: the rent and lease cards on the dashboard (U5), the market-rent tile on the property page (U12), the lease-history section on the tenant page (U13), and the email/role/"Read-only" chips in the header (U4).

## 6. Screens that need no change

- **Property dialog** and **Unit dialog** — clear, short, working.
- **Property documents panel** — working; only the "visibility" wording changes to "Shared with" (see N9).

## 7. Suggested design and build order

1. **Foundations:** navigation, header, status labels, row component, state patterns (section 2; U4). Everything else depends on these.
2. **Request page (N3)** — the centre of the product; retire D6.
3. **Home screens:** Tenant Home (N1), Admin Dashboard (U5), Landlord Home (N2); retire D5.
4. **Messages (N4)** and **Notifications (N5)**.
5. **People (N7)** with Approvals (U15), Tenants (U13), Landlords (U14), Team (N8), Vendors (U16); then retire D1–D4.
6. **Remaining:** Account (N6), Admin Documents (N9), queues (U6–U9), submit form (U10), property screens (U11–U12), auth screens (U1–U3), D7.

U2 (password reset) is a defect fix and should ship ahead of all of this.

## 8. Decisions that change these designs

| Decision | If "yes" | If "no" |
|---|---|---|
| Q1 Hide leasing, rent, applications, rent policy | D1–D4 proceed | They stay under an admin "More" group; U5 and U12 keep their rent content |
| Q2 New / Assigned / In progress / On hold / Completed labels | Section 2.3 as written | Keep Open / Scheduled / Closed, but still one label set on every screen |
| Q4 Landlords read the tenant conversation on a request | Landlord sees the full timeline, read-only for tenant messages | Landlord sees status entries and their own thread only (designed above) |
| Q5 Landlords can submit requests | "Report an issue" on N2 and U9; landlord variant of U10 | Those buttons are omitted |
| Q6 Tenants of one unit share requests and conversation | N1 and U8 show all of the unit's requests with the reporter's name | Each tenant sees only their own |
| Q7 Push notifications at launch | N6 adds a "Notifications on this device" toggle | Email and in-app only |
