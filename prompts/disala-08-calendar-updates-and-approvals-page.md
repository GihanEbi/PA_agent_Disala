# Disala — Backend Phase 5: Calendar update/cancel (approval-gated) + the dedicated /approvals page

## Goal

Close the two concrete gaps `prompts/disala-07-agent-chat-approvals.md` explicitly deferred to "a follow-up Phase 5," and nothing else:

1. **`calendar.updateEvent` / `calendar.cancelEvent`, end to end.** Real "prepare" functions following the `prepareEvent` pattern Phase 3 established, real write functions following the `createEvent` pattern Phase 4 established, two new `propose_*` agent tools, and the two missing `executeApproval` branches for `ApprovalActionType.CALENDAR_UPDATE` / `CALENDAR_CANCEL` — the two enum values that have existed in `prisma/schema.prisma` since Phase 0 with, verifiably, no code path anywhere that can create or execute one.
2. **The dedicated `/approvals` page from `AGENTS.md` §18** — today's approvals, pending/approved/rejected/failed, filterable, with an expandable detail view — so approvals stop being visible only inside the one conversation turn that happened to create them.

Both are drawn from the same deferred list and are genuinely coupled (see "Should this be split further?" below): the approvals page has to render the two new action types, and the two new action types are half the reason a type filter on that page is worth building.

### Why the scope line is drawn exactly here

`prompts/disala-07-agent-chat-approvals.md` deferred five things. I re-checked all five against the actual code before scoping this phase, rather than trusting that prompt's own summary of what it left undone:

| Deferred item | Still true? (verified) | In this phase? |
| --- | --- | --- |
| `calendar.updateEvent`/`cancelEvent` + payload shapes | Yes — `grep` for `updateEvent`, `cancelEvent`, `events.patch`, `events.delete` across the repo returns hits only in `AGENTS.md` §5's tool list and in prompts explaining the deferral. `lib/integrations/calendar.ts` exports exactly `getEvents, findAvailableTimes, prepareEvent, createEvent`. | **Yes** |
| Dedicated `/approvals` page (§18) | Yes — `app/` contains no `approvals` route (`app/actions/approvals.ts` is a Server Action file, not a route segment); `ApprovalCard` is rendered from exactly one place, `components/disala/chat-transcript.tsx`. | **Yes** |
| Proactive suggestions + `Suggestion` model | Yes — `grep` for `db.suggestion` returns zero hits; the table has never been written to. | **No** |
| `reminders.*` tools + `Reminder` model | Yes — `grep` for `db.reminder` returns zero hits. | **No** |
| Wiring static `/`, `/mail`, `/calendar` to live data | Yes — `app/calendar/page.tsx` still maps a literal four-item `EVENTS` array; `app/mail/page.tsx` and `app/page.tsx` are the same (`EMAILS`, `INSIGHTS`). | **No** |
| Voice input (speech-to-text) | Yes — the mic button in `components/disala/voice-sheet.tsx` is still inert. | **No** |

The four excluded items are excluded for reasons specific to each, not because the phase filled up:

- **Suggestions and reminders both depend on infrastructure that does not exist.** The defining property of a proactive suggestion (`AGENTS.md` §12: "You have a meeting with Acme tomorrow… would you like me to prepare a response?") and of a reminder (§17) is that it fires **without a user message**. Every server-side code path in this project today begins with an authenticated HTTP request from a signed-in browser — there is no job runner, no cron, no queue. Building `Suggestion`/`Reminder` writes without that trigger would produce rows nothing ever surfaces at the right moment, which is worse than not building them. Choosing a scheduler (Vercel Cron, a Supabase `pg_cron` job, an external queue) is its own architectural decision with its own prompt.
- **Wiring `/`, `/mail`, `/calendar` to live data is real work, but entirely orthogonal.** It touches zero integration code, zero approval code, and zero agent code — it is `lib/integrations/*` read functions called from three Server Components, plus deciding what those pages show when Google isn't connected. Folding it in here would mean one prompt containing "the most dangerous write path in the product" and "replace three hardcoded arrays," reviewed as one unit. Those deserve separate approval decisions.
- **Voice input is an integration choice nobody has made yet** (Whisper, OpenAI's Realtime API, or the browser's own `SpeechRecognition` — three quite different products), unchanged from Phase 4's reasoning.

### Should this be split further?

I considered splitting calendar-update/cancel from the approvals page and decided against it, on the following grounds — recorded here so you can overrule it cheaply:

- They are **coupled in one specific, unavoidable place**: `components/disala/approval-card.tsx` currently branches `actionType === "EMAIL_SEND"` / `"CALENDAR_CREATE"` and renders `null` for anything else. Both halves of this phase touch that file — one to add two new payload renderers, one to add a list presentation. Splitting means touching it twice, and means the approvals page would ship with a filter over action types where half the values are unreachable.
- **Neither half is large on its own.** The calendar half is four new functions in one existing file that already contains their two structural templates, two agent tools that are near-copies of `propose_meeting`, and two `executeApproval` branches that are near-copies of the `CALENDAR_CREATE` branch. The page half is one query function, one Server Component, one small client filter component, and a `variant` prop. Combined, this is smaller than `disala-07` by a wide margin, and comparable to `disala-06`.
- **Zero new dependencies, zero schema migration.** `ApprovalActionType.CALENDAR_UPDATE`/`CALENDAR_CANCEL` already exist in the enum (confirmed in `prisma/schema.prisma` lines 30–38); `Approval.result` already exists (Phase 4's migration `20260905203022_approval_result`); `package.json` already has everything needed. This is the first backend phase since Phase 2 with no `prisma migrate` step and no `npm install` — a meaningful reduction in what can go wrong.

**If, during implementation, the calendar half turns out to be larger than this prompt predicts, the clean cut line is the approvals page** — it touches no file under `lib/integrations/` and can be lifted out wholesale into its own prompt without leaving the calendar work half-done. The reverse is not true.

## Relevant skills

- `clerk-nextjs-patterns` — reused unchanged for `/approvals`'s server-side `auth()` gate, the same pattern `app/notes/page.tsx` and `app/settings/connections/page.tsx` already use.
- `supabase-postgres-best-practices` — consulted for the `listApprovals` filter query, though **no schema change is needed this phase** (see above), so this is about query shape (indexed `userId` scoping, no `LIKE` on unindexed columns) rather than migrations.

No packaged skill exists for the Google Calendar API, so the two write endpoints this phase adds were verified live against Google's own reference docs during this session rather than recalled — the same discipline `disala-06` applied to `events.insert`/`freebusy.query`:

- [`events.patch`](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch) (fetched live) — `PATCH /calendars/{calendarId}/events/{eventId}`. Confirmed **patch semantics**: "the field values you specify replace the existing values… fields you don't specify remain unchanged." Critically, also confirmed: **"array fields, if specified, overwrite the existing arrays; this discards any previous array elements."** That single sentence is load-bearing for this phase's payload design and for the approval card's wording (see decisions #3 and #7) — a partial `attendees` update is not a thing Google supports, so Disala must never describe one as "adding an attendee." Query param `sendUpdates` accepts `all` / `externalOnly` / `none`. Returns the **modified Events resource** on success. The reference page does **not** document ETag/`If-Match` optimistic-concurrency support for this method — flagging that honestly rather than assuming it exists, because it's the mechanism I'd otherwise have used to close the propose-time/approve-time drift gap (see Assumptions).
- [`events.delete`](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete) (fetched live) — `DELETE /calendars/{calendarId}/events/{eventId}`. No request body. Same `sendUpdates` query param with the same three values. Confirmed: **"on success, returns an empty response body."** There is no provider-generated identifier to echo back, which directly determines what `Approval.result` can honestly record for a cancellation (decision #6). The reference page does not document the error returned for an already-deleted event.
- [`events.get`](https://developers.google.com/workspace/calendar/api/v3/reference/events/get) — `GET /calendars/{calendarId}/events/{eventId}`, returns one Events resource; used by this phase's prepare step (decision #2).

## Existing code inspected

- `lib/integrations/calendar.ts` (read in full) — exports exactly `getEvents, findAvailableTimes, prepareEvent, createEvent`. Confirmed the three patterns this phase must match verbatim rather than approximate:
  - **Read pattern** (`getEvents`): `schema.safeParse(input)` → `invalidInput(parsed.error.issues[0]?.message)` on failure → `getAuthorizedGoogleClients(userId)` → early-return `clients` itself when `!clients.ok` (the envelope is passed through, not re-wrapped) → `runGoogleApiCall(userId, () => clients.data.calendar…)` → map the raw response into a narrow local type with `?? ""` / `?? null` defaults.
  - **Prepare pattern** (`prepareEvent`): `safeParse` → `hasUsableGoogleConnection(userId)` (the *cached* pre-check, **not** `getAuthorizedGoogleClients`) → return a pure shaped object. Zero network calls. Note the specific detail that `prepareEvent` uses `hasUsableGoogleConnection` while every other function uses `getAuthorizedGoogleClients` — that's not an inconsistency, it's the point: prepare deliberately never touches Clerk or Google.
  - **Write pattern** (`createEvent`): a **separate** Zod schema (`createEventSchema`) matching `EventPayload`'s exact shape, re-validated on the way *out* of the `Json` column with the in-file comment explaining why ("this payload sat in a Json column and lost its static type on the way — validating on the way back out is cheap insurance against a malformed row"). Then the standard `getAuthorizedGoogleClients` → `runGoogleApiCall` sequence. Preceded by a block comment stating it is "only ever called from `lib/approvals.ts`'s post-approval execution step."
  - Shared local helpers this phase reuses as-is: `invalidInput<T>()`, `isoDateTime` (a `z.string().refine(Date.parse)`, deliberately **not** `z.string().datetime()`), `ianaTimeZone` (a `refine` that constructs an `Intl.DateTimeFormat`), `MAX_RESULTS_CAP = 50`.
  - **`getEvents`'s return shape already includes `id`** — plus `summary`, `start`, `end`, `attendees`, `htmlLink`, `status`. Directly checked, because the whole update/cancel design depends on whether the agent can identify a specific existing event from a read it has already done. It can. **No change to `getEvents` is required**, and none is made (see decision #10).
- `lib/integrations/google-client.ts` (read in full) — `GoogleApiResult<T>`, the six `GoogleApiErrorCode` values, `hasUsableGoogleConnection`, `getAuthorizedGoogleClients`, `runGoogleApiCall`. Confirmed `runGoogleApiCall<T>(internalUserId, fn: () => Promise<{ data: T }>)` is generic over `T` with no read-only assumption, and that its `catch` maps `401 → NEEDS_REAUTH` (+ `markGoogleConnectionNeedsReauth`), `403 → INSUFFICIENT_SCOPE | RATE_LIMITED` by `reason`, `429 → RATE_LIMITED`, everything else → `PROVIDER_ERROR` carrying the provider's own message. **Nothing in this file changes.** Noted for the error-handling section: because the mapping is by HTTP status only, a `404`/`410` from `events.delete` on an already-deleted event lands in `PROVIDER_ERROR` with Google's own message — acceptable, and the reason the *prepare* step is where non-existent events actually get caught.
- `lib/approvals.ts` (read in full) — `createApproval` (sets `expiresAt` from `APPROVAL_TTL_MS = 24h`), `getApproval(userId, approvalId)` (`findFirst` scoped by `userId`), `executeApproval`, `approveApproval` (the atomic `updateMany` claim), `rejectApproval`. Confirmed `executeApproval`'s exact shape: an `if (approval.actionType === X)` block per type, each calling its write function, then **one** `db.approval.update({ where: { id }, data: { status: result.ok ? EXECUTED : FAILED, executedAt: new Date(), result: (...) as Prisma.InputJsonValue } })`, then `return result`. It ends with a fallthrough that marks the row `FAILED` with `PROVIDER_ERROR: "No execution path for ${actionType}"` — which is, today, exactly what a `CALENDAR_UPDATE` row would hit. This phase adds two more `if` blocks in the same shape ahead of that fallthrough and changes nothing else in the file except adding `listApprovals`.
- `lib/agent/tools.ts` (read in full) — `buildAgentTools(userId, conversationId)` returns 8 tools. Confirmed `propose_meeting`'s exact body: `prepareEvent(userId, input)` → early return the failure envelope if `!prepared.ok` → `createApproval({ ... payload: prepared.data as unknown as Prisma.InputJsonValue })` → `return { approvalId, status: "pending_approval" as const }`. The two new tools are structural copies of this. Confirmed `userId`/`conversationId` are captured by closure and appear in no `inputSchema` — the property this phase must preserve exactly.
- `components/disala/approval-card.tsx` (read in full) — `"use client"`. `ApprovalData` is a loose `{ id, actionType: string, title, description, status: string, payload: unknown, result: unknown }` (strings, not enums, because it crosses the server/client boundary). `StatusBadge` maps `EXECUTED → <Badge variant="resolved">{actionType === "EMAIL_SEND" ? "Sent" : "Created"}</Badge>`, `FAILED → attention`, `REJECTED`/`EXPIRED` → `neutral`, else `schedule` "Pending approval". Payload rendering is a ternary chain: `EMAIL_SEND → <EmailPayloadSummary>`, `CALENDAR_CREATE → <EventPayloadSummary>`, **else `null`** — so a `CALENDAR_UPDATE` row today would render a card with a title and no substance whatsoever. Actions are `<Button variant="primary">Approve</Button>` / `<Button variant="secondary">Reject</Button>`, shown only when `status === "PENDING"`, wrapped in `useTransition`, with local `useState` holding the post-action approval.
- `components/disala/chat-transcript.tsx` — the only current consumer: `message.approvals?.map((approval) => <ApprovalCard key={approval.id} approval={approval} />)`. Confirms adding an optional `variant` prop defaulting to the current behavior is a zero-risk change to this call site.
- `components/disala/bottom-nav.tsx` (read in full) — `type NavKey = "home" | "mail" | "calendar" | "notes"` and a 4-element `NAV_ITEMS`. Rendered by `components/disala/app-footer.tsx`, which positions a 64px mic `Button` with `mb-[-28px]` overlapping the nav bar. Confirms adding a 5th tab is a **layout** change, not a config change — see decision #8.
- `components/disala/app-header.tsx` (read in full) — the Phase 1 precedent: `<UserButton>` already wraps `<UserButton.MenuItems><UserButton.Link label="Connections" href="/settings/connections" labelIcon={<PlugZap size={16} strokeWidth={1.6} />} /></UserButton.MenuItems>`. Adding a second `UserButton.Link` is a two-line change to a pattern already proven in this file.
- `app/settings/connections/page.tsx` (read in full) — the precedent for a secondary route in this app: server-side `auth()` → `redirect("/sign-in")`, `getOrCreateInternalUser()`, `<AppHeader>`, a `<SectionHeader title meta>`, content, and a `<Link href="/">← Back to Disala</Link>`. Notably it renders **no `AppFooter`/`BottomNav` at all**. `/approvals` follows this shape exactly.
- `app/notes/page.tsx` — the precedent for a data-backed page: `auth()` → `getOrCreateInternalUser()` → `Promise.all([getHeaderIdentity(), listNotes(internalUser.id)])` → `SectionHeader meta={`${notes.length} total`}`.
- `lib/format-timestamp.ts` — `formatNoteTimestamp(date, now?)` produces "Today, 9:12 PM" / "Yesterday, …" / weekday / short date. Despite the name it is entirely generic (it references nothing about notes). Reused as-is for approval timestamps rather than renamed — see decision #9.
- `components/ui/badge.tsx` — variants are exactly `attention` (gold), `resolved` (green), `schedule` (teal), `neutral`. No destructive/red variant exists; `approval-card.tsx` renders errors with a raw `text-red-400` class. Relevant to the cancel card's treatment (decision #7).
- `components/ui/button.tsx` — variants `primary` (gold fill), `secondary` (gold outline), `tertiary` (neutral fill), `text` (teal link). No destructive variant.
- `components/ui/select.tsx` — a full Base UI `Select` (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, …) exists and is currently **unused by any page** (grep: referenced only from `app/style-guide/page.tsx`). It is the obvious primitive for the approvals filters — a new one would be unjustifiable.
- `prisma/schema.prisma` — `ApprovalActionType` already contains `EMAIL_SEND, CALENDAR_CREATE, CALENDAR_UPDATE, CALENDAR_CANCEL, NOTE_CREATE, NOTE_UPDATE, OTHER`; `ApprovalStatus` already contains all six states; `Approval` already has `result Json?`, `expiresAt`, `approvedAt`, `rejectedAt`, `executedAt`. **No migration this phase.**
- `package.json` — `@googleapis/calendar@^16`, `zod@^4.5.4`, `@base-ui/react`, `lucide-react`, `ai`, `@ai-sdk/openai` all present. **No new dependency this phase.**
- `proxy.ts` — still `clerkMiddleware()` with no callback, so still protects nothing globally (unchanged since Phase 1's flagged assumption, and `/api/webhooks(.*)` was never added to a public matcher because there is no matcher). `/approvals` therefore gates itself in its own Server Component, exactly like `/notes` and `/settings/connections` do.
- Whole-repo grep confirming the starting state: `updateEvent`, `cancelEvent`, `events.patch`, `events.delete`, `events.update` — zero call sites; `db.suggestion`, `db.reminder` — zero call sites; no `app/approvals` route.

## Architectural decisions

1. **Four new functions in `lib/integrations/calendar.ts`, not a new file: `getEvent`, `prepareEventUpdate`, `prepareEventCancel`, `updateEvent`, `cancelEvent`.** (Five, counting the read.) This is `disala-07` decision #8 applied again without modification: `AGENTS.md` §5 puts provider-specific logic behind the integration layer, and this file *is* that layer for Calendar. Every one of them reuses `getAuthorizedGoogleClients`/`runGoogleApiCall`/`hasUsableGoogleConnection`/`invalidInput`/`isoDateTime`/`ianaTimeZone` unchanged. No new error codes, no new envelope, no new helper.

2. **The two prepare functions perform a real Calendar *read* (`events.get`), unlike `prepareEvent`.** This is the one place I deliberately deviate from Phase 3's prepare pattern, and it is the most consequential decision in this prompt, so the reasoning is explicit:
   - `prepareEvent` (create) does no API call because there is nothing to read — the event doesn't exist yet, and every field of the proposal comes from the user's own request.
   - An update or a cancellation is about **an event that already exists and that the user will see described on an approval card before deciding**. If the prepare step doesn't read it, the only source for "what you are about to change/destroy" is whatever the model typed into the tool call. That means the approval card for the single most irreversible action in this product could show a summary, time, or attendee list the model *inferred* — presented to the user as fact, on the exact screen where `AGENTS.md` §7 says "the user should always understand what Disala is about to do before approving it" and §15 says known information must be distinguishable from AI output. A hallucinated attendee list on a cancellation card is a straightforwardly unacceptable failure mode.
   - Reading is not writing. Phase 3's rule was "this phase performs zero **write** calls" (`disala-06` decision #1), and `AGENTS.md` §7.3 lists "reading today's calendar" under generally-low-risk actions. A prepare function that reads the thing it's preparing to modify preserves every security property Phase 3 cared about: no mutation, nothing to clean up, nothing external happens.
   - So: `prepareEventUpdate`/`prepareEventCancel` call `getEvent(userId, { eventId })` and build a **`snapshot`** — `{ summary, start, end, attendees, htmlLink }` — from **Google's own response**, never from the model's arguments. That snapshot goes into `Approval.payload` and is what the card renders. It also gives two free correctness gates: proposing against a non-existent `eventId` fails at prepare time with the provider's own 404 (so no `Approval` row is ever created for a phantom event), and an event already returned with `status === "cancelled"` is refused rather than proposed for cancellation again.
   - `getEvent` is exported as a normal read function (mirroring `gmail.getEmail`), not hidden inside the prepare functions — it's a legitimate part of the Calendar read surface and the agent may need it directly later. It is **not** exposed as a new agent tool this phase (the agent already gets full event objects from `get_calendar_events`; adding a ninth tool for a capability the model already has is tool-surface bloat).

3. **`Approval.payload` for `CALENDAR_UPDATE`** — three parts, each with a distinct job:
   ```ts
   {
     eventId: string,
     // Only the keys present here are sent to events.patch. Google's patch
     // semantics leave every omitted field untouched.
     changes: {
       summary?: string
       description?: string
       start?: { dateTime: string; timeZone: string }
       end?:   { dateTime: string; timeZone: string }
       attendees?: { email: string }[]
     },
     sendUpdates: "all" | "externalOnly" | "none",
     // Read from Google at prepare time. Display + audit only — never sent
     // back to the API.
     snapshot: {
       summary: string
       start: string | null
       end: string | null
       attendees: { email: string }[]
       htmlLink: string
     }
   }
   ```
   Validation rules on `changes`, each with a reason:
   - **At least one key must be present** (`.refine(obj => Object.keys(obj).length > 0)`). An "update" that changes nothing is a meaningless approval to put in front of a user.
   - **`start` and `end` are both-or-neither**, and when present `end` must be after `start` (the same `.refine` `prepareEvent` already applies). Google's patch semantics would happily accept a lone `start` that lands after the untouched `end`, producing an invalid event; requiring both makes the local check possible. The agent always has both values available from `get_calendar_events` or from `snapshot`, so this costs it nothing.
   - **`attendees`, if present, is the complete new list.** This is not a design choice — `events.patch`'s documented behavior is that a specified array "overwrites the existing array; this discards any previous array elements." The Zod schema accepts it as a full replacement and the approval card must **say so in those words** (decision #7). Disala must never render "adding Sarah" for an operation that in fact replaces the guest list.
   - The whole `changes` object is deliberately a **partial**, mirroring the API's own semantics, rather than a full event the caller must reconstruct. Requiring the caller to resend every field would mean an agent that mis-remembers one unrelated field silently overwrites it — strictly worse.

4. **`Approval.payload` for `CALENDAR_CANCEL`** — the same shape minus `changes`:
   ```ts
   { eventId: string, sendUpdates: "all" | "externalOnly" | "none", snapshot: { ... } }
   ```
   No `reason`/`message` field. Google's `events.delete` takes no body, so there is nowhere to put one; inventing a Disala-side "cancellation reason" that never reaches any attendee would be a field that looks like it does something and doesn't.

5. **`sendUpdates` defaults to `"all"` and is always sent explicitly**, matching `prepareEvent`'s existing `parsed.data.sendUpdates ?? "all"` default. Reason for `"all"` rather than `"none"`: changing or cancelling a meeting that other people have on their calendars, without telling them, is the behavior of a broken assistant. Reason for *explicit*: Google's default when the parameter is omitted is not something I want this product's most consequential behavior to depend on. The agent may pass `"none"` when the user explicitly asks not to notify anyone, and the approval card always states plainly which of the two will happen.

6. **`Approval.result` for the two new types**, matching each API's actual response rather than a uniform shape:
   - `CALENDAR_UPDATE` success → `{ eventId, htmlLink }`. `events.patch` returns the modified Events resource, so `htmlLink` is real, provider-supplied confirmation.
   - `CALENDAR_CANCEL` success → `{ eventId, cancelled: true }`. `events.delete` **returns an empty body** (verified above). There is no provider identifier to record, and inventing one would be fabricating an audit trail. `cancelled: true` here means exactly "Google accepted the DELETE and returned success" — which is precisely the verification `AGENTS.md` §7.5 demands and no more. `eventId` is echoed from the payload, clearly derived from our own request rather than presented as a provider response.
   - Failure → `{ error: { code, message } }` for both, identical to the existing branches.

7. **The cancel approval card gets a deliberately different, heavier treatment than every other card — this is the one place in this phase where UI copy is a correctness requirement, not polish.** Cancelling is the only action Disala can take that *destroys* something that already exists on other people's calendars, and `AGENTS.md` §3 offers no reference image for it, so it is built from existing primitives only (`Button` variants, `Badge` variants, existing token classes — no new design system surface). Concretely:
   - The card renders the **`snapshot`** verbatim — real summary, real start/end, real attendee list, as read from Google — under a heading that names the operation without euphemism ("Cancel meeting", not "Update calendar").
   - Immediately below it, one plain-language consequence line assembled from structural facts, not model output: *"This deletes the event from your Google Calendar. The N people invited will be notified that it's cancelled."* (or *"…will not be notified."* when `sendUpdates` is `"none"`, or the attendee clause omitted entirely at zero attendees). This is the literal implementation of §1's "what information will be affected / what will happen after approval / the exact changes that will be made."
   - **A two-step confirm.** For `CALENDAR_CANCEL` only, "Approve" does not call the Server Action; it flips local component state and the button becomes "Yes, cancel this meeting" alongside a "Keep it" escape. Purely client-side (`useState`), no server or schema change, no effect on any other action type. Rationale: `AGENTS.md` §7.3 groups "sending an email" and "canceling a meeting" under one approval requirement, but a mis-sent email can be followed by an apology, whereas a cancelled meeting has already vanished from other people's calendars along with a notification saying so. One extra deliberate click is a proportionate response to that asymmetry, and it is the cheapest possible mechanism that achieves it.
   - The update card gets the same snapshot-plus-consequence structure but a single-click Approve — it is consequential but not destructive, and gating routine edits behind two clicks would train the user to click through both.
   - `StatusBadge`'s `EXECUTED` label is extended from its current binary (`EMAIL_SEND ? "Sent" : "Created"`) to a per-type map: `EMAIL_SEND → "Sent"`, `CALENDAR_CREATE → "Created"`, `CALENDAR_UPDATE → "Updated"`, `CALENDAR_CANCEL → "Cancelled"`. A cancelled meeting whose card reads "Created" would be actively misleading.

8. **`/approvals` is reached from the `UserButton` menu, not a fifth bottom-nav tab.** This is the navigation decision with the least obvious answer, so both options are argued:
   - *For a fifth tab*: `AGENTS.md` §18 calls the Approvals page "an important part of the product," and pending approvals are time-sensitive in a way that Connections is not.
   - *Against, decisively*: (a) The 4-item bottom nav is a **designed artifact** reproduced from your reference images in `disala-01`/`disala-02-05`. There is no reference image for a 5-item bar, and `AGENTS.md` §3 is unambiguous that I don't design UI — inventing a fifth tab is exactly the "restyle or improve beyond the reference" that section forbids. (b) It isn't a config change: `app-footer.tsx` centers a 64px mic button over the bar with a hardcoded `mb-[-28px]` overlap; five items at `max-w-md` changes item widths and where the mic lands. That is a visual redesign with no reference to check it against. (c) `AGENTS.md` §3's overriding instruction — "the application should avoid becoming a collection of disconnected dashboards" and "the conversation should remain the primary interaction" — argues against promoting a *history/review* surface to equal billing with the four primary surfaces. Approvals are meant to be acted on inline in the conversation (Phase 4 already does that); `/approvals` is the audit-and-catch-up view, which is `/settings/connections`-shaped, not `/mail`-shaped. (d) Phase 1 set exactly this precedent and it works.
   - So: a second `<UserButton.Link label="Approvals" href="/approvals" labelIcon={<ShieldCheck size={16} strokeWidth={1.6} />} />` (a `lucide-react` icon, same size/stroke as the existing `PlugZap`), and the page itself mirrors `/settings/connections` — `AppHeader`, `SectionHeader`, content, `← Back to Disala`, no `AppFooter`. `NavKey` is not touched.
   - **Explicitly not built**: a pending-approval count badge anywhere in the header. It would need a DB count on every page render of every route, and `AppHeader` is a Client Component that currently takes only display props. Worth doing; not worth doing as a side effect of this phase.

9. **`/approvals` renders `ApprovalCard` with a new `variant?: "chat" | "list"` prop (default `"chat"`), following the `EmailCard`/`EventCard`/`NoteCard` precedent exactly.** Those three each gained a `variant?: "card" | "flat"` when a second context needed them, rather than being forked. `ApprovalCard` is already a Client Component wired to the two Server Actions, and Approve/Reject must work identically from the list — forking it would mean two components that both send real emails and must be kept in sync forever. `variant="list"` adds: a `formatNoteTimestamp(createdAt)` meta line, a plain-language action-type label ("Email · Send", "Calendar · Cancel"), and an expandable **Details** disclosure. `variant="chat"` is byte-identical to today's rendering, so `chat-transcript.tsx` needs no change at all. `ApprovalData` gains `createdAt: string` and `expiresAt: string | null` (ISO strings — they cross the server/client boundary, same reason `actionType`/`status` are `string` rather than the Prisma enums).
   - `formatNoteTimestamp` is reused as-is rather than renamed to `formatTimestamp`. The name is mildly stale, but renaming it means touching `app/notes/page.tsx` and `lib/format-timestamp.ts` for zero functional gain in a phase whose most valuable property is a small, reviewable diff. Noted as cosmetic debt, not fixed here.

10. **The detail view is an in-card disclosure, not an `/approvals/[id]` route.** `AGENTS.md` §19 says, in its own words, "for more complex actions, provide an **expandable detail view**" — the word is expandable, not a page. §18's "opening an approval should show" list (what / why / target service / data involved / exact action / created time / current status / result) is fully satisfiable in an expanded card, and every one of those fields is already on the row. A separate route would additionally need its own auth gate, its own not-found handling, and a third `ApprovalCard` variant. Rejected as ceremony. Reconsider if a future phase adds per-approval content that genuinely doesn't fit inline.

11. **Filters are server-side, driven by `searchParams`, and can only ever narrow.** `listApprovals({ userId, status?, service?, since? })` in `lib/approvals.ts` builds a Prisma `where` that **always** starts from `{ userId }`, with each optional filter appended as an additional constraint. Every incoming `searchParam` is parsed against a fixed whitelist (Zod `z.enum` over the real `ApprovalStatus` values / the four service groups / three date ranges); anything unrecognised — including a value crafted to look like a Prisma operator — falls back to "All" and is discarded, never interpolated into the query. There is no code path where a client-supplied value can widen the `userId` scope, because `userId` is not derived from input at all: it comes from `getOrCreateInternalUser()` in the Server Component. This is the same property `deleteNote`'s ownership-scoped `deleteMany` established in Phase 2, applied to a read.
12. **"Action type" and "Service" are one filter, not two.** `AGENTS.md` §18 lists filter dimensions as "Status, Action type, Date, Service" and then, two lines later, enumerates *action types* as "Email, Calendar, Notes, Reminder, Other" — which is a **service** list, not an action list. Reading those two lines together, there is one intended coarse grouping, and shipping two dropdowns (one for `EMAIL_SEND | CALENDAR_CREATE | CALENDAR_UPDATE | CALENDAR_CANCEL | …`, one for `Email | Calendar | Notes | Other`) would be two controls over the same column that can contradict each other. So: one **Service** filter with values `All | Email | Calendar | Notes | Other`, mapped to `ApprovalActionType` sets server-side (`Email → [EMAIL_SEND]`, `Calendar → [CALENDAR_CREATE, CALENDAR_UPDATE, CALENDAR_CANCEL]`, `Notes → [NOTE_CREATE, NOTE_UPDATE]`, `Other → [OTHER]`). "Reminder" is omitted from the options because no `ApprovalActionType` for reminders exists and none can exist until the deferred reminders phase — offering a filter that provably matches nothing would be a lie in the UI. The precise `actionType` remains visible on every card's label and in its Details disclosure, so nothing is hidden.

13. **"Today's approvals" (§18) is the default view, not a separate section.** The Date filter defaults to **Today** (`createdAt >= start of the local day`), with `Last 7 days` and `All` as the other options. §18 opens with "It should provide: Today's approvals" and then lists filters — defaulting the date filter to Today satisfies that directly, and is better than a fixed "Today" section plus a separate filtered list, which would show the same row twice whenever a filter widened. The empty state names the active filters ("No approvals today. Try 'Last 7 days'.") so a user never mistakes a narrow filter for an empty history.

14. **Two new agent tools, `propose_update_meeting` and `propose_cancel_meeting`** — structural copies of `propose_meeting`: call the prepare function, early-return its failure envelope untouched if `!ok`, `createApproval`, return `{ approvalId, status: "pending_approval" as const }`. `userId`/`conversationId` stay captured by closure and appear in neither `inputSchema`. Names deliberately mirror the existing `propose_*` prefix so the model's mental grouping of "these tools do not act" stays intact.
    - **`title`/`description` stay templated, per `disala-07` decision #7** — `Update meeting: ${snapshot.summary}` / `Cancel meeting: ${snapshot.summary}`, where `snapshot.summary` came from Google, not the model. Descriptions: `"Disala prepared this change based on your conversation."` / `"Disala prepared this cancellation based on your conversation."` The model does not get to editorialize on the card about the action it is asking permission for.

15. **Two new `executeApproval` branches, added before the existing fallthrough**, each an exact structural copy of the `CALENDAR_CREATE` branch: call the write function with `approval.payload`, one `db.approval.update` writing `status`/`executedAt`/`result` on both the success and failure path, `return result`. The existing `"No execution path for ${actionType}"` fallthrough stays — it still guards `NOTE_CREATE`/`NOTE_UPDATE`/`OTHER`, which remain unreachable. Nothing about `approveApproval`'s atomic claim changes, so the double-click idempotency guarantee extends to the two new types for free — which is exactly why it was built as a claim rather than a per-action check.

16. **Both write functions re-validate their payload with their own Zod schema on the way out of the `Json` column**, following `createEvent`'s in-file precedent and comment. For `cancelEvent` this is a two-field schema (`eventId`, `sendUpdates`) and might look like ceremony — it isn't: it is the last line of defense before a `DELETE` against a real calendar, and it guarantees a malformed or hand-edited row produces `INVALID_INPUT` rather than a request built from `undefined`. `snapshot` is accepted-and-ignored by both write schemas (it is display data, never sent to Google); this is stated in a comment so a future reader doesn't "fix" it by forwarding it.

## Assumptions

- **`calendarId: "primary"` throughout**, unchanged from Phases 3–4. An `eventId` from a secondary calendar would 404 at prepare time and produce an honest "I couldn't find that event" rather than a wrong action — an acceptable failure mode for a limitation nothing in the product exposes yet.
- **No optimistic-concurrency check between propose time and approve time.** The `snapshot` is read at prepare time; if the event is moved or cancelled in Google Calendar during the up-to-24-hour approval window, the card shows stale facts and `events.patch` applies to whatever the event has become. `events.patch`'s reference page does not document ETag/`If-Match` support (verified above), so the mechanism I'd reach for isn't confirmably available. This is the same class of gap `disala-07` flagged for availability re-checks and does not silently corrupt anything — Google's own 404/410 still stops a cancel against an already-deleted event. Flagged, not solved. A future phase could re-read in `executeApproval` and abort on drift.
- **`disala-07`'s crash-between-claim-and-execute gap is inherited unchanged.** A process death between `status = APPROVED` and the final `EXECUTED`/`FAILED` write strands the row. This phase adds two more action types that can strand the same way; it does not make the gap worse, and it does not fix it (a reconciliation job is still the honest answer). The `/approvals` page does make such rows **visible** for the first time — an `APPROVED` row that never reached `EXECUTED` now shows up in the list rather than being invisible outside Postgres, which is a small real improvement.
- **`Approval.expiresAt` stays at 24 hours** (`APPROVAL_TTL_MS`) for the two new types. A stale cancellation is arguably worse than a stale send and might deserve a shorter TTL, but `AGENTS.md` §7.3 says the approval policy "should be configurable as the product evolves," and inventing a second hardcoded constant is not configurability. One constant until there's a real policy surface.
- **Expiry is still lazy.** Nothing sweeps expired rows; `approveApproval` flips `PENDING → EXPIRED` when it encounters one. The `/approvals` list therefore shows a past-`expiresAt` row as "Pending" until someone touches it. The list page mitigates this in display only — a `PENDING` row whose `expiresAt` is in the past renders as "Expired" with its actions hidden, so the user is never offered a button that will immediately tell them it expired. The database row is not mutated by rendering the page (a `GET` must not have side effects); it flips on the next approve attempt, as today.
- **No pagination on `/approvals`.** A capped `take` (200) with newest first, matching `/notes`'s no-pagination decision. A single user's approval history grows slowly; add pagination when it's a real problem.
- **The `/approvals` page does not re-render itself after Approve/Reject.** `ApprovalCard` already holds the post-action approval in local `useState` and updates in place — the same behavior the chat gets. No `revalidatePath` is added to `app/actions/approvals.ts`, which stays exactly as it is (adding one would be a cross-cutting change to an action shared with the globally-mounted voice sheet, for no benefit the local state doesn't already deliver).
- **`User.timezone` is still `"UTC"` for everyone** — the gap `disala-07` flagged and inherited. It affects this phase concretely: the Date filter's "Today" boundary and every rendered event time are computed in the server's/browser's local time, not the user's declared timezone. Unchanged, still flagged, still fixed by a settings phase rather than here.
- **No new environment variables, no new dependencies, no schema migration.**

## Files expected to change

New:
- `app/approvals/page.tsx` — Server Component: `auth()` gate → `getOrCreateInternalUser()` → parse `searchParams` through the whitelist → `listApprovals(...)` → render `AppHeader`, `SectionHeader`, `ApprovalFilters`, the card list (`variant="list"`), empty state, and the `← Back to Disala` link.
- `components/disala/approval-filters.tsx` — `"use client"`, three `Select`s (Status / Service / Date) from the existing `components/ui/select.tsx`, pushing the chosen values into the URL via `useRouter().replace(...)` so filters are shareable/bookmarkable and re-read server-side.

Modified:
- `lib/integrations/calendar.ts` — add `getEvent`, `prepareEventUpdate`, `prepareEventCancel`, `updateEvent`, `cancelEvent`; extend the export list. Existing functions untouched.
- `lib/approvals.ts` — add the `CALENDAR_UPDATE`/`CALENDAR_CANCEL` branches to `executeApproval` (before the existing fallthrough); add `listApprovals({ userId, status?, service?, since? })`. `createApproval`/`getApproval`/`approveApproval`/`rejectApproval` untouched.
- `lib/agent/tools.ts` — add `propose_update_meeting` and `propose_cancel_meeting` (10 tools total).
- `lib/agent/system-prompt.ts` — add the update/cancel behavioral rules (see "AI/agent behavior").
- `components/disala/approval-card.tsx` — add `variant?: "chat" | "list"` (default `"chat"`); add `UpdatePayloadSummary`/`CancelPayloadSummary` to the payload ternary chain; extend `StatusBadge`'s `EXECUTED` label map; add the cancel two-step confirm; add `createdAt`/`expiresAt` to `ApprovalData`; treat a past-`expiresAt` `PENDING` row as expired for display.
- `components/disala/app-header.tsx` — add the second `UserButton.Link` for `/approvals`.
- `app/api/chat/route.ts` — extend the `propose_email`/`propose_meeting` tool-name filter that collects `approvalIds` to include the two new tool names (**easy to miss, and if missed the new approval cards silently never appear in chat** even though the rows exist).

Not touched: `lib/integrations/google-client.ts`, `lib/integrations/gmail.ts`, `lib/integrations/gmail-mime.ts`, `lib/notes.ts`, `lib/conversations.ts`, `lib/connected-accounts.ts`, `lib/format-timestamp.ts`, `app/actions/approvals.ts`, `components/disala/chat-transcript.tsx`, `components/disala/bottom-nav.tsx`, `components/disala/app-footer.tsx`, `components/disala/voice-sheet.tsx`, `prisma/schema.prisma`, `package.json`, `proxy.ts`, `app/page.tsx`, `app/mail/page.tsx`, `app/calendar/page.tsx`, `app/notes/**`, `app/settings/**`, `app/style-guide/page.tsx`.

## Functional requirements

**Calendar update**
- Asking Disala to change an existing meeting ("move my 3pm with Sarah tomorrow to 4pm", "rename Design sync to Design review") produces a rendered `ApprovalCard` (`CALENDAR_UPDATE`) showing the event's **current** summary/time/attendees as read from Google, the **specific** changes to be applied, and whether attendees will be notified — with **no Calendar write having happened yet**.
- Approving it applies exactly those changes via `events.patch` and leaves every unmentioned field untouched (a summary-only change must not clear the description or the guest list).
- The card's post-approval state reflects the real provider result, including the event link Calendar returns.

**Calendar cancel**
- Asking Disala to cancel an existing meeting produces an `ApprovalCard` (`CALENDAR_CANCEL`) showing the real event being destroyed and a plain-language statement of consequences including whether the N invitees will be notified — with **no Calendar write yet**.
- The card requires a second, explicit confirmation click before the Server Action is called; "Keep it" returns the card to its unconfirmed state without contacting the server.
- Approving it deletes the event from Google Calendar and the card reports "Cancelled", never "Created".
- Rejecting either kind of card marks it `REJECTED` with zero Calendar activity.

**Both**
- Proposing an update or cancellation for an `eventId` that doesn't exist, or for an event already `status: "cancelled"`, produces an honest failure in the conversation and **no `Approval` row at all**.
- Asking to change a meeting without saying what to change, or ambiguously ("move my meeting" when three exist that day), produces a clarifying question in plain text — no tool call, no `Approval`.
- Double-triggering Approve results in exactly one `events.patch` / one `events.delete`.

**Approvals page**
- `/approvals` while signed in lists the signed-in user's approvals only, newest first, defaulting to Today, with the real count in the section meta.
- Status / Service / Date filters narrow the list; each is reflected in the URL and survives a reload; an unrecognised filter value in the URL falls back to "All" rather than erroring or widening scope.
- Every card exposes an expandable Details view showing: what Disala wanted to do, why (the description), the target service, the exact payload, created time, expiry, current status, and the recorded result (provider id/link, or the exact failure).
- A `PENDING` approval can be approved or rejected directly from `/approvals` with the same effect as from the chat, and updates in place without a page reload.
- A `PENDING` row whose `expiresAt` has passed renders as expired with no action buttons.
- The empty state names the active filters rather than implying no approvals exist.
- `/approvals` is reachable from the `UserButton` menu on every page; the bottom nav is unchanged everywhere.

## Security considerations

- **`updateEvent` and `cancelEvent` are reachable only from `executeApproval`.** No agent tool, Server Action, route handler, or component imports either. Verified the same way `disala-07` verified `sendEmail`/`createEvent`: by grepping for `events.patch` and `events.delete` and confirming the only call sites are inside those two functions. "The model decided to cancel a meeting" is not a code path that can exist regardless of what the model outputs — only a user's own confirmed Approve click reaches the DELETE.
- The two new agent tools' `inputSchema`s contain no `userId`/`conversationId`, same as the existing eight; both are captured by `buildAgentTools`'s closure after the session is resolved server-side.
- `listApprovals`'s `where` clause is always seeded with the session-resolved `userId`; filters can only add constraints. Filter values are whitelisted via Zod enums before reaching Prisma — a client-supplied value cannot widen scope, address another user's rows, or reach the query as anything but a known enum member (decision #11).
- `/approvals` gates itself server-side (`auth()` → `redirect("/sign-in")` → `getOrCreateInternalUser()`), not via middleware, matching `/notes` and `/settings/connections` — `proxy.ts` still protects nothing globally and is not changed here.
- `approveApprovalAction`/`rejectApprovalAction` are unchanged and already re-resolve the caller's `userId` server-side and scope by it; calling them from a second surface adds no new trust assumption.
- `snapshot` is display-and-audit data read from Google, and is explicitly **not** forwarded to `events.patch` — it cannot become a vector for writing stale state back over a changed event.
- Event summaries, descriptions, and attendee email addresses are never logged; failure paths log the error code/HTTP status only, unchanged from Phase 3's discipline.
- No Google credential is touched by any new code — `getAuthorizedGoogleClients` remains the only place a token is held, for the duration of a single call.

## AI/agent behavior

- Two new tools, both non-acting, both returning `{ approvalId, status: "pending_approval" }`:
  - `propose_update_meeting({ eventId, summary?, description?, start?, end?, timeZone?, attendees?, sendUpdates? })` — the model supplies only what should change. `timeZone` is required whenever `start`/`end` are supplied (validated).
  - `propose_cancel_meeting({ eventId, sendUpdates? })`.
- Both tools' `description` strings state, in the model-facing text, that they change nothing and create a pending approval — the same wording pattern that has kept `propose_email`/`propose_meeting` honest in Phase 4's live testing.
- System prompt additions (appended to the existing lines, which already cover "never claim an email was sent or an event was created"):
  - To change or cancel a meeting, first find it with `get_calendar_events` and use that event's `id`. **Never guess or construct an event id.**
  - Only propose an update or a cancellation when it is unambiguous which event the user means. If more than one event plausibly matches, list the candidates and ask which one — do not pick.
  - When updating, pass **only** the fields that should change. When changing the time, pass both `start` and `end`.
  - Passing `attendees` **replaces the entire guest list** — only pass it when the user has stated the complete intended list, and describe it to the user as a replacement, never as "adding" someone.
  - Cancelling a meeting is irreversible and notifies the people invited. Never propose a cancellation the user did not clearly ask for, and never bundle one into an unrelated request.
  - Both tools only *prepare* — say the change is ready for approval, never that the meeting was moved or cancelled.
- Failure envelopes from the prepare functions (`PROVIDER_ERROR` on a missing event, `NOT_CONNECTED`, `NEEDS_REAUTH`, `INVALID_INPUT`) are returned to the model as tool results so it explains them honestly, unchanged from Phase 4's handling of the other tools.

## Approval requirements

- `CALENDAR_UPDATE` and `CALENDAR_CANCEL` are the two action types this phase adds to the set that can be created and executed, bringing the total to four. Both are named directly in `AGENTS.md` §7.3's "requires approval" list ("Canceling a meeting", "Changing an important calendar event") — with the note that §7.3 says *important* calendar event; this phase requires approval for **every** update, because "important" is a judgment call and the only entity available to make it would be the model, which is precisely the entity the approval gate exists to check. Requiring approval uniformly is the conservative reading and the one consistent with §23.
- `NOTE_CREATE`/`NOTE_UPDATE`/`OTHER` remain unreachable — no tool creates them and `executeApproval`'s fallthrough still marks any such row `FAILED` rather than acting. Unchanged from Phase 4; restated so the gap stays explicit rather than becoming folklore.
- Every new card satisfies `AGENTS.md` §19's checklist: what Disala wants to do (the operation, named plainly), why (templated description), the exact data affected (the Google-read snapshot plus the literal changes), what happens after approval (including the attendee-notification consequence line), and Approve/Reject. Post-resolution, the same card shows the outcome — updated/cancelled, or the exact provider failure — rather than disappearing.
- The cancel card additionally requires a second explicit confirmation (decision #7). This is a deliberate departure from uniform card treatment, justified by the irreversibility asymmetry, and is the only action type that gets it.

## Error handling

- Every new function returns the existing `GoogleApiResult<T>` envelope and never throws for an expected failure. No new `GoogleApiErrorCode` values.
- **Prepare-time failures never create an `Approval`.** `prepareEventUpdate`/`prepareEventCancel` return before `createApproval` is reached if: input fails Zod (`INVALID_INPUT`), there's no usable Google connection (`NOT_CONNECTED`/`NEEDS_REAUTH`), the event doesn't exist (Google's 404 → `PROVIDER_ERROR` carrying Google's own message), or the event is already `status: "cancelled"` (`INVALID_INPUT`, with a message the model can relay: "that event is already cancelled"). The user sees an honest explanation in the conversation and no orphan pending card.
- Execution-time failures write `status: FAILED`, `executedAt` (an attempt happened), and `result: { error: { code, message } }` — identical to the existing two branches. The card reports the specific failure ("I couldn't cancel that meeting — Google rejected the request. Nothing was changed."), never a generic success.
- An `events.delete` against an already-deleted event returns 404/410, which `runGoogleApiCall` maps to `PROVIDER_ERROR` carrying Google's own message ("Resource has been deleted"). Acceptable and honest; the *prepare*-time existence check is where this case is normally caught, and `runGoogleApiCall`'s status mapping is shared code that isn't worth changing for one message.
- Because `events.delete` returns an empty body, "success" for a cancellation means exactly "Google returned a success status" — recorded as `{ eventId, cancelled: true }` and worded that way to the user. No provider identifier is invented.
- `/approvals` with an unparseable or unknown `searchParam` renders the unfiltered-for-that-dimension list rather than throwing or 400-ing.
- If `listApprovals` throws (a real Prisma/database error), the page surfaces a plain "couldn't load your approvals" state rather than a blank page — same discipline as `/settings/connections`'s load-failure handling.

## Acceptance criteria

- **Grepping the repo for `events.patch` finds exactly one call site — inside `updateEvent` in `lib/integrations/calendar.ts`. Grepping for `events.delete` finds exactly one — inside `cancelEvent` in the same file.** Neither appears in `lib/agent/tools.ts`, `app/api/chat/route.ts`, any Server Action, or any component. (Same check `disala-07` used for `messages.send`/`events.insert`; re-run those two as a regression check at the same time.)
- Against a real Google-connected test account with a real event: asking Disala to move that event produces an `ApprovalCard` whose displayed current summary/time/attendees match what Google Calendar's own web UI shows, and whose stated change matches what was asked. Google Calendar shows **no change** at this point.
- Approving it changes exactly the intended fields in Google Calendar — description and guest list verifiably unchanged after a summary-only or time-only edit — and `Approval.status = "EXECUTED"` with `result.eventId`/`result.htmlLink` populated.
- Asking Disala to cancel a real event produces an `ApprovalCard` showing the real event and a consequence line naming the correct attendee count and notification behavior; a single Approve click does **not** cancel it (the second confirmation is required); the event still exists in Google Calendar at that point.
- Confirming the cancellation removes the event from Google Calendar, the card reads "Cancelled" (not "Created"), and `Approval.status = "EXECUTED"` with `result = { eventId, cancelled: true }`.
- Rejecting an update or cancel card sets `REJECTED` with confirmed zero change in Google Calendar.
- Double-clicking Approve on an update, and on a cancel, each results in exactly one provider call — verified by the row transitioning `PENDING → APPROVED → EXECUTED` once and by the calendar's own state.
- Proposing against a fabricated `eventId` produces an honest failure in chat and **zero** new `Approval` rows in Postgres.
- `/approvals` lists exactly the signed-in user's approvals; a second test user's approvals are never visible (verified with two accounts and directly in Postgres).
- Each filter narrows correctly and is reflected in the URL; hand-editing a filter param to a garbage value (including something shaped like a Prisma operator) falls back to "All" and never returns another user's row.
- Every action type — `EMAIL_SEND`, `CALENDAR_CREATE`, `CALENDAR_UPDATE`, `CALENDAR_CANCEL` — renders a meaningful payload summary on `/approvals` and in chat; none render an empty card.
- `/approvals` is reachable from the `UserButton` menu; `components/disala/bottom-nav.tsx` is byte-identical to its current state and all four existing pages' footers look unchanged.
- Chat rendering of `EMAIL_SEND`/`CALENDAR_CREATE` cards is visually unchanged from before this phase (the `variant` default preserves it).
- `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass; `npx prisma validate` passes (no schema change expected — this is a safety check, and if it reports a needed migration, something in this phase went wrong).

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma validate`

## Manual test steps

Prerequisite: signed in as the Phase 1 test user with Google connected, and at least three real events on today's/tomorrow's primary calendar — one with two or more attendees (a second address you control, so notification behavior is observable), one with a non-empty description, and one you're happy to destroy.

1. `npm run dev`. Open the voice sheet, tap the keyboard button, ask "What's on my calendar tomorrow?" — confirm the real events come back (a regression check on `get_calendar_events`, and it gives the agent the event ids the next steps need).
2. Ask to rename one of them ("rename Design sync to Design review"). Confirm: an `ApprovalCard` appears showing the event's **current** summary, time, and attendees exactly as Google Calendar shows them; the change is described as summary-only; Google Calendar shows no change yet; `Approval.status = "PENDING"` and `payload.snapshot` in Postgres matches the real event.
3. Approve it. Confirm Google Calendar shows the new title, **the description and guest list are unchanged**, the card shows "Updated", and `result.eventId`/`result.htmlLink` are set.
4. Ask to move a different event's time ("move my 2pm to 4pm"). Confirm the card shows both old and new times, approve, and confirm the real event moved and its other fields survived.
5. Ask to change something ambiguously ("move my meeting" on a day with several). Confirm Disala asks which one and creates **no** `Approval` row.
6. Ask to cancel the disposable event. Confirm the card names the real event, states the attendee count and that they will be notified, and that a single Approve click only reveals the confirmation step — Google Calendar still shows the event.
7. Click "Keep it". Confirm the card returns to its unconfirmed state and the row is still `PENDING`.
8. Approve and confirm. Confirm the event is gone from Google Calendar, the other attendee received a cancellation notification, the card reads "Cancelled", and `result = { eventId, cancelled: true }`.
9. Create one more cancellation proposal and **Reject** it. Confirm `REJECTED` in Postgres and the event still on the calendar.
10. Create one more proposal (update or cancel), open the chat in two tabs, and approve from both as close together as possible. Confirm exactly one provider call took effect and the second response reports the already-resolved state.
11. Ask Disala to cancel a meeting that doesn't exist ("cancel my meeting with Nobody next Tuesday"). Confirm an honest reply and **zero** new `Approval` rows.
12. Manually delete an event in Google Calendar's own UI, then ask Disala to cancel it (using an id it saw earlier in the conversation). Confirm the prepare step fails honestly and creates no approval.
13. Open the `UserButton` menu; confirm both "Connections" and "Approvals" appear; open `/approvals`.
14. On `/approvals`: confirm every approval created above appears with the correct status; expand a Details view on one of each of the four action types and confirm all of §18's fields are shown (what/why/service/data/exact action/created/status/result).
15. Exercise each filter (Status, Service, Date) and confirm the URL updates, a reload preserves the selection, and the counts are right. Set Date to "Today" with nothing from today and confirm the empty state names the filter.
16. Hand-edit the URL to `?status=NOT_A_STATUS&service=%7B%22gt%22%3A%22%22%7D`; confirm the page renders the unfiltered list for those dimensions and does not error.
17. Create one more proposal from chat, then approve it **from `/approvals`** instead of the chat. Confirm the real action happened and the card updated in place without a page reload.
18. Sign in as a second test user with their own Google connection; create one approval; confirm `/approvals` shows only their own row, and confirm in Postgres that neither user's rows are visible to the other.
19. Confirm the bottom nav on `/`, `/mail`, `/calendar`, `/notes` is visually unchanged, and that an `EMAIL_SEND` card in chat looks exactly as it did before this phase.
20. In the connected Google account's "Third-party apps & services" settings, revoke Disala's access; ask Disala to cancel a meeting. Confirm a plain "your Google connection needs to be reconnected" reply, no crash, no approval row, and `ConnectedAccount.status = NEEDS_REAUTH`.
21. `npm run lint`, `npx tsc --noEmit`, `npm run build` — confirm all pass.

---

## Manual setup required before I can implement/test this

None. No new environment variable, no new dependency, no Google Cloud or Clerk dashboard change, and no database migration — the OAuth scope this needs (`calendar.events`, granted in Phase 1) already covers `events.patch` and `events.delete`, and `ApprovalActionType.CALENDAR_UPDATE`/`CALENDAR_CANCEL` and `Approval.result` already exist in the schema.

One thing to have ready before the manual tests: a **disposable real calendar event with a second attendee address you control**, since step 8 permanently deletes it and sends that address a real cancellation notice.

Is this good to execute?
