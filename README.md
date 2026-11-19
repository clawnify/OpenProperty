# SiLL · Super Intel LandLord

SiLL is a resident and property-manager portal for real households. It runs as a Cloudflare Worker with Better Auth, Drizzle and Neon PostgreSQL. The public site includes Docs, Blog, About us, Contact, and a resident assistant. The application code is MIT licensed. The original MIT notice is in LICENSE.

## Run the portal

Use Node 24 and npm. Create a new Neon database. Run migrations with an owner connection, then use a separate unprivileged login for the application. Database URLs and provider tokens belong in secret bindings.

```sh
npm ci
MIGRATION_DATABASE_URL="$OWNER_POSTGRES_URL" npm run db:migrate
psql "$OWNER_POSTGRES_URL"
```

In psql, create the runtime login once and enter its password at the prompt. The password does not appear in your shell history.

```sql
CREATE ROLE sill_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
\password sill_runtime
\i db/runtime-grants.sql
```

Copy .env.example to .dev.vars for local Workers development. Set DATABASE_URL to the Neon connection with the sill_runtime login, BETTER_AUTH_URL to the actual browser origin (http://localhost:8787 locally), and BETTER_AUTH_SECRET to a random value of at least 32 bytes. Start with `npm run dev`. Run `npm run build && npm test` for the upstream regression suite and the end-to-end household access checks. The latter run the real Worker, Better Auth, Drizzle and SQL against an ephemeral PGlite PostgreSQL instance over a local Neon HTTP test adapter.

For Cloudflare, use `npx wrangler secret put DATABASE_URL`, `npx wrangler secret put BETTER_AUTH_SECRET`, and `npx wrangler secret put BETTER_AUTH_URL`. Use `npm run deploy` in the target account. Configure the Workers custom domain in Cloudflare and set CUSTOM_ORIGIN to its exact HTTPS origin (for example https://sill.ing) to support sign-in on both the platform URL and your custom domain. Its DNS and certificate must be active before inviting residents. The checked-in Wrangler configuration schedules outbound event retries every five minutes. The managed-hosting build also exposes stateless MCP discovery at /mcp.

## Onboard a property and its residents

1. Create an account in Resident portal. Choose **Create a portfolio**, then **Add a household**. A portfolio belongs to the manager who created it. Use a distinct household per tenancy, such as “Oak House · Unit 2 · Spring 2027.”
2. Under **Manage**, enter lease dates, monthly rent, and the property's provider-hosted HTTPS checkout link. Add a charge under **Record a ledger entry** when it becomes due. The monthly rent field describes the lease. It does not post charges automatically.
3. Generate a resident invitation using the intended email address and share the private link directly. The recipient signs in with that address and accepts the invitation. A code expires in seven days, is stored as a hash, and can be claimed once.
4. Residents see only their joined households. They can open checkout, see recorded charges and payments, create a repair request, and follow its history. Store money as integer USD cents. The property team verifies the provider receipt and records the payment. Visiting or returning from checkout never marks a bill paid.
5. Managers can preview CSV or CAMT.053 statements locally in their browser, review a row, and record a confirmed payment. Verify the date, payer, currency and amount before saving. The upstream bank matching and reminder libraries and their regression suites remain in src/shared and tests.
6. Remove a departing resident under **Manage → Residents** and revoke the household's integration key if its operator changes. Create a new household for the next tenancy. Public Contact submissions are stored in contact_messages for the site operator to review in Neon. Property managers do not see this site-wide inbox.

## Ticket handling

Urgency is low, normal, high or urgent. Status is open, assigned, in_progress, completed or cancelled. Staff can adjust urgency, change status and write a resident-visible update. Ticket creation and changes append to the event history in the same database transaction. SiLL does not dispatch emergency responders.

Under **Manage → Integrations**, generate a household key and keep it server-side. Rotation invalidates the previous key immediately. Each key can read event metadata and manage tickets for exactly one household. A request cannot select another household by supplying a home ID.

```sh
curl "$BASE_URL/api/webhooks/tickets?after=0" -H "Authorization: Bearer $HOUSEHOLD_KEY"
curl "$BASE_URL/api/webhooks/tickets" -H "Authorization: Bearer $HOUSEHOLD_KEY" \
  -H 'Content-Type: application/json' -d '{
  "subject":"Kitchen faucet", "details":"A steady drip from the spout.",
  "category":"Plumbing", "urgency":"normal",
  "requestKey":"59dad7bd-cf73-4141-9926-24fd405b4c5f"
}'
```

Create a new UUID for each distinct submission. Reuse it when retrying that submission. The authenticated update body is `{"action":"update","id":"TICKET_UUID","status":"in_progress","urgency":"high","note":"Assigned to maintenance."}`. The GET feed returns up to 100 events in ascending order. Pass the last returned ID as the next after cursor. Responses to integrations omit resident names, subject lines, descriptions and staff notes. Browser sessions use the resident API to access the full record.

For optional **outbound POST delivery**, set WEBHOOK_HOME_ID, TICKET_WEBHOOK_URL and TICKET_WEBHOOK_SECRET for the chosen household. The receiver gets a JSON envelope with version and events. Verify the HMAC-SHA256 of `timestamp + "." + rawBody` using the shared secret against the hex value in X-SiLL-Signature after the v1= prefix. Reject stale X-SiLL-Timestamp values and deduplicate by event ID. Delivery is at least once. SiLL advances the stored cursor only after a successful HTTP response. In a managed host without a cron trigger, poll the authenticated GET feed or enable the Worker cron in your own Cloudflare account. Scope additional households through their own authenticated feeds.

## MCP and the assistant

POST JSON-RPC to /api/mcp or /mcp. initialize, ping and tools/list support discovery. tools/call requires a household bearer key. Available operations are tickets_list, tickets_create, tickets_update and tickets_events.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tickets_events","arguments":{"after":0}}}
```

SiLL keeps original ticket text inside the household record. Before any provider receives a chat question or routing request, the application reduces it to an allowlisted intent, category and/or urgency. This prevents a name, address, phone number or account detail embedded in free text from leaving the portal through these paths. ClipGuard then checks the limited summary. Provider output never sets rent balances or changes a real ticket automatically.

| Provider | Endpoint | Use |
| --- | --- | --- |
| ClipGuard | https://clipguard.worksai.org/api/mcp | scrub_clipboard checks the limited outbound summary. |
| APISync Studio | https://apisync.worksai.org/api/mcp | diff_openapi checks the ticket intake example against its static contract. |
| LedgerFlow | https://ledgerflow.worksai.org/api/mcp | normalize_csv runs a synthetic diagnostic. Live household finances stay in Neon. |
| OmniDesk | https://omnidesk.worksai.org/api/mcp | triage_ticket provides an advisory priority when managers choose Check support routing. A person reviews the suggestion. |
| OpenRouter | https://openrouter.ai/api/v1/chat/completions | openrouter/free turns approved portal guidance into a brief reply. |

Supply OPENROUTER_API_KEY to enable model replies. Where required, set separate CLIPGUARD_TOKEN, APISYNC_TOKEN, LEDGERFLOW_TOKEN or OMNIDESK_TOKEN bindings. The built-in resident guide answers when a key is absent, no eligible free model is available, redaction cannot be checked, or a provider times out. Only the external provider can determine its current availability.

## Data model

Better Auth session identity controls portfolio and household membership. Each portal API request rechecks membership. Machine access resolves a hashed, revocable key to one home. Tickets, ledger entries and ticket history also have forced PostgreSQL row-level security. Drizzle applies the household setting transaction-locally on every scoped read or write. Use a non-owner login without BYPASSRLS. Keep the migration connection separate from the public Worker.

The illustrated property on the home page is an original generated image. The two granite wordmarks are the supplied SiLL brand assets. Font licenses ship with the Worker at /licenses/dm-sans.txt and /licenses/instrument-serif.txt.

