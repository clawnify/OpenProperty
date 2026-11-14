# Figma mockups — handoff

**Date:** 2026-11-14 · **Status:** paused part-way through step 2 of 3. Nothing has been reviewed yet.

This is everything needed to continue the Landlord Gopher mockups with another tool or person.

## 1. Where things are

| Thing | Location |
|---|---|
| Figma file | https://www.figma.com/design/mx94NqyGDpnrTbilEWx3cr/LG-%E2%80%94-Maintenance-WO (file key `mx94NqyGDpnrTbilEWx3cr`) |
| Design brief | `docs/UX_UI_DESIGN.md` on branch `claude/affectionate-turing-w888i6`. A copy is here as `UX_UI_DESIGN.snapshot.md`. |
| Kit guide | `KIT_GUIDE.md` — rules, component names and properties, state requirements, shared sample data |
| Script helpers | `prelude.js` — tested Figma Plugin API helpers (clone a template, create instances, set properties, lay out a page) |
| Build notes | `BUILD_REPORTS.md` — what each page builder reported, including gaps and judgment calls |

In the Figma file, every new page is prefixed `UPGRADED —`. The older pages before the separator (Admin board, Worker jobs, Tenant requests, Landlord read, Dialogs, _Capture refs, Components) are the current app and were not touched.

## 2. What exists

| Page | Page id | State | Frames |
|---|---|---|---|
| UPGRADED — Foundations | `8:99` | Done, approved by the owner | Variables, text and shadow styles, 45 components, 46 icons, 3 screen templates |
| UPGRADED — Auth | `20:81` | Built, not reviewed | 61 |
| UPGRADED — Messages | `20:78` | Built, not reviewed | 87 |
| UPGRADED — Home | `20:77` | Built, not reviewed | 42 |
| UPGRADED — Request | `20:76` | Built, not reviewed | 72 |
| UPGRADED — People | `20:79` | **Incomplete**, not reviewed | 85 |
| UPGRADED — Lists | `20:80` | **Incomplete**, not reviewed | 99 |

Each screen page holds one auto-layout frame called `Board`. Inside it there is one row per screen variant, and inside each row one labelled slot per frame (`Desktop · Default`, `Phone · Loading`, and so on). Desktop frames are 1440 wide; phone frames are 390 wide.

Decisions applied (section 8 of the brief): Q1 yes, Q2 yes, Q4 no, Q6 no, Q7 no. Q5 is drawn only in rows whose title starts `VARIANT (Q5, not approved) —`.

## 3. What is still needed

### 3.1 Finish step 2 (two pages were stopped before the end)

**People page**
- [ ] U16 Vendors tab — not started. Needs the list (name, contact, phone, Jobs count; no colour picker), the add/edit dialog, and the states (default, loading, error, empty, success) at desktop and phone.
- [ ] A whole-page visual check. The builder was stopped before its final check and wrote no report.

**Lists page**
- [ ] U17 Documents, tenant and landlord — only the default frames exist. Needs loading, empty, error and success at both widths.
- [ ] N9 Admin Documents — only the default frames exist. Needs loading, empty, filtered empty, error, success, and the Upload dialog with the property picker (desktop and phone).
- [ ] A whole-page visual check. The builder was stopped before its final check and wrote no report.

### 3.2 Step 3 — review (not started)

Someone who did not build the screens checks every frame against:
- [ ] Section 2.3: only New / Assigned / In progress / On hold / Completed; priority badge only for Emergency and High; every status followed by its next step in words.
- [ ] Section 2.4: read-only information as text, not disabled inputs; everything clickable is a link or button with a focus example; people by name with role; relative and absolute dates; dialogs only for short tasks; lists use the one row component.
- [ ] Section 2.5: loading, empty, filtered empty, error and success present where they apply.
- [ ] Section 2.6: phone is single column, bottom tabs (admin: top bar and drawer), full-width primary action at the bottom, full-screen forms with a sticky submit bar, tap targets at least 44 px.
- [ ] The screen's own spec in section 3 or 4 of the brief.

Then fix what the review finds and write the summary.

### 3.3 Known problems to fix (found during the build, none fixed yet)

1. **Phone list row clips long status text.** "On hold · waiting for part · follow-up Fri 20 Nov" overflows the 390-wide row by about 24 px. Fix it once in the Foundations `List Row` (Layout=Phone) so the status line wraps, then recheck every phone list.
2. **Sample data contradicts itself.** The brief gives Maple Court 1 open request and Birch House none; the shared data in `KIT_GUIDE.md` gives Maple Court three open and Birch House one on hold. Pick one and make Landlord Home, Properties and the queues agree.
3. **Navigation unread counts are fixed per component variant.** Sidebar and tab-bar badges show the defaults (for example landlord Messages = 2) whatever the screen content says. Only Messages and the dashboard zero-state frames were corrected by hand.
4. **Icon colour after an icon swap.** Icons swapped inside empty states and buttons can render dark instead of their intended colour. Fixed on the Request page; People and Lists were stopped before applying the fix; Auth, Messages and Home should be checked by eye.
5. **Frames not inspected at readable size.** Each builder checked some frames only in an overview. The lists are in `BUILD_REPORTS.md`.
6. **Account page, admin:** only the default frame exists; the states were drawn for the tenant only.
7. **Messages, notifications:** the request name in each sentence is plain text; the brief emphasises it.
8. **Dark mode has not been looked at** on any page. The variables have Dark values.

### 3.4 Components the screens needed that Foundations does not have

Builders made these locally on their own pages. Adding them to Foundations would make the pages consistent:
- Selected state for the list row (Messages uses Hover as a stand-in)
- Notification item, popover panel, thread header, day divider
- Password field with show/hide, date field, radio group label
- Inline notice / warning callout (emergency line, "no unit linked", inline sign-in error)
- Read-only ("Messages closed") state for the message composer, and a filled state
- Photo thumbnail and add-photo tile
- Page-shaped and form-shaped loading skeletons, stat-tile skeleton
- Unit card, property card, worker job row (the list row has only one context line)
- Signed-out page frame with brand mark and auth card
- A "nothing active" variant for the sidebar and bottom tabs (Account and Page not found show Home as active)
- Bottom sheet for short dialogs on phone

### 3.5 Decisions only the owner can make

- Real office phone, email and emergency wording. Placeholders in use: (410) 555-0134, help@landlordgopher.example, "call 911 first".
- Whether workers can add photos to a request (currently they cannot, because the brief does not list it).
- Where an admin reads and answers a landlord's thread on a request (drawn on the landlord side only).
- Q5 landlord form: "OK to enter if I'm not home" does not suit a landlord and needs different wording if Q5 is approved.
- The admin New request dialog has eight fields, as the brief lists, which is over the brief's own "about six fields" rule for dialogs.
- Whether to delete or archive the old pages once the upgraded ones are accepted.

## 4. Rules the existing pages follow

Keep to these so new work matches:
- Use only Foundations components, the LG variables, and the LG text and shadow styles. No hardcoded colours.
- Do not edit the Foundations page from a screen page; if a component is missing, build it locally and list it.
- Never put opacity on a variable-bound fill; use a variable such as `overlay`, `muted` or `tab-active`.
- One row per screen variant, one labelled slot per frame, everything inside the page's `Board`.
- Frame names: `<ID> · <Screen> · <Role> · Desktop|Phone · <State>`.
