# Disala — Wire the /calendar page to real Google Calendar data

## Goal

Replace the hardcoded four-item `EVENTS` mock array in `app/calendar/page.tsx` with the signed-in user's real Google Calendar events for today, mirroring `disala-09`'s `/mail` work exactly. **Notes are already fully wired to real data (`app/notes/page.tsx` → `lib/notes.ts` → `NoteRow`/`NoteCard`) and the agent already has full tool access to both Calendar and Notes** — confirmed by inspection below, so neither needs new backend or agent work. This prompt's only job is the one remaining gap: the calendar *display* page. **No file under `lib/integrations/gmail*`, `app/mail/**`, `app/api/chat/**`, or any other previously-shipped Gmail/voice work is touched by this phase.**

## Relevant skills

None specific — no new Google API surface is added (`calendar.events.list` is already called by the existing, working `getEvents`), no new dependency, same auth pattern `/mail` and `/notes` already establish.

## Existing code inspected

- `app/calendar/page.tsx` (full file) — the mock: a literal `EVENTS` array of 4 hand-typed items (`time`, `title`, `attendees` as one free-text string mixing attendee names *and* a location, e.g. `"Priya Fernando, Zoom"`, and `upNext: boolean`), rendered via `EventCard`, with `SectionHeader meta="4 things today"` hardcoded and `AppFooter unreadCount={3}` hardcoded. No `auth()`, no data fetching beyond `getHeaderIdentity()`.
- `app/notes/page.tsx` and `lib/notes.ts` (both read in full) — **confirmed already wired to real data**: `auth()` → `getOrCreateInternalUser()` → `listNotes(internalUser.id)` → real `Note[]` rendered via `NoteRow`/`NoteCard` with a dynamic `${notes.length} total` meta. Nothing here needs to change.
- `lib/agent/tools.ts` (full file) — confirmed all five calendar tools (`get_calendar_events`, `find_available_times`, `propose_meeting`, `propose_update_meeting`, `propose_cancel_meeting`) and both notes tools (`search_notes`, `create_note`) are already built and wired into `buildAgentTools`. The agent already has full read/propose access to both services — this phase adds no new tool and changes no agent behavior.
- `lib/integrations/calendar.ts` (full file) — `getEvents(userId, { timeMin, timeMax, maxResults? })` is fully functional today: Zod-validated, `getAuthorizedGoogleClients` → `runGoogleApiCall` → real `calendar.events.list` call with `singleEvents: true, orderBy: "startTime"`. Returns `GoogleApiResult<CalendarEvent[]>` where today's `CalendarEvent = { id, summary, description, start, end, attendees: {email, responseStatus?}[], htmlLink, status }`. **Confirmed gaps in this exact shape relative to what the mock displayed**: no `location` field is mapped at all (Google's `Events` resource has one; `getEvents` simply doesn't read it), and `attendees` carries only `email`/`responseStatus` — no `displayName`, even though Google's `EventAttendee` resource can include one. The mock's rich "Priya Fernando, Zoom" line depended on both a name and a location that today's mapped type cannot produce.
- `components/disala/event-card.tsx` (full file) — presentation-only. Props: `{ time, title, attendees, upNext?, showAskDisala?, variant, className }`, where `attendees` is a single pre-formatted string (not a list) and `showAskDisala` (default `true`) renders a plain, **already non-functional** `<Button variant="text">Ask Disala</Button>` with no `onClick` in either variant branch — confirmed by reading the component, matching the same "decorative, not wired" state `disala-09` found for the Mail page's "Ask Disala to reply" button.
- `lib/format-timestamp.ts` (full file, current state after `disala-09`) — houses `formatNoteTimestamp` and `formatEmailTimestamp`, both built around a shared local `isSameDay` helper. Its own doc comment already establishes it as a generic timestamp module, not Notes- or Mail-specific — the natural home for a third formatter.
- `lib/format-email.ts` (full file, from `disala-09`) — the precedent for a small, dependency-free formatting module (`parseFromHeader`, `getInitials`) colocated by concern rather than folded into the integration file. This phase's attendee/location formatting follows the same pattern in a new `lib/format-event.ts`.
- `components/disala/bottom-nav.tsx` / `app-footer.tsx` — unchanged since `disala-09`; `unreadCount` still only ever reflects the Mail badge and is still hardcoded `3` on every page except `/mail` itself (`disala-09` decision #6, explicitly left as a known, flagged inconsistency rather than fixed globally). Not revisited here for the same reason it wasn't revisited for Notes.

## Architectural decisions

1. **Read the day's events directly from the Server Component via `lib/integrations/calendar.ts` — no agent/tool involved**, identical reasoning to `disala-09` decision #1: this is a plain authenticated read of the signed-in user's own data, already grouped under "generally low-risk" in `AGENTS.md` §7.3 ("Reading today's calendar").
2. **Extend `CalendarEvent` with two small, additive fields — `location: string` and `attendees[].displayName?: string`** — the minimum change needed to recover the mock's display richness from real data. Both come straight off the same `events.list` response `getEvents` already fetches (Google's `Event.location` and `EventAttendee.displayName`); nothing new is requested from the API, no new scope, no new call. This is the one integration-layer change in this phase, confined entirely to `lib/integrations/calendar.ts`'s existing mapping step — `getEvent`, `prepareEvent`, `createEvent`, `prepareEventUpdate`, `prepareEventCancel`, `updateEvent`, `cancelEvent` are untouched, and the change is purely additive (existing consumers of `CalendarEvent`, including the agent's `get_calendar_events` tool, keep working unchanged and simply gain two more fields they can ignore or use).
3. **New `lib/format-event.ts`** exports `formatAttendeesLine(event: { attendees: {email: string; displayName?: string}[]; location: string }): string` — joins each attendee's `displayName ?? email`, caps the visible list at 2 names with a `"+N more"` suffix beyond that (mirroring the numeric-cap spirit of `disala-09` decision #5's `9+` badge — a 12-person standup shouldn't blow out a single-line card), then appends the location if present, exactly reproducing the mock's `"Priya Fernando, Zoom"` shape from real data. Returns an empty string (not a placeholder) when there are no attendees and no location, so `EventCard` can render cleanly with nothing on that line.
4. **New `formatEventTime(startIso: string | null)` added to `lib/format-timestamp.ts`** — a date-only string (Google's representation of an all-day event's `start.date`, no time component) renders as `"All day"`; a real `dateTime` renders as a plain time (`"9:30 AM"`), matching the mock's exact convention. `null` (a malformed/missing start, which `getEvents` already defends against by typing it nullable) renders as an em dash `"—"` rather than crashing or showing `"Invalid Date"`.
5. **"Up next" is computed, not stored** — after fetching today's events (already ordered by start time via `orderBy: "startTime"`), the page finds the first event whose parsed `start` is at or after the current instant and marks only that one `upNext`. If every event today has already started/passed, none are marked — an honest "nothing left today" state rather than mis-flagging a past event.
6. **`showAskDisala` stays tied to `upNext`, exactly like the mock** (`showAskDisala={event.upNext}`), and the button remains **decorative this phase** — it already had no `onClick` before this change, so this is not a regression. Wiring it to actually open the voice/chat sheet pre-filled about that specific meeting is a natural follow-up (the same kind of follow-up `disala-09` flagged for the Mail page's reply button), not bundled in here.
7. **The query window is "today" in the server's local time** (`timeMin` = start of today, `timeMax` = start of tomorrow), matching the section header "Today" and the mock's implied scope. This inherits the same standing timezone gap `disala-07`/`disala-08`/`disala-09` already flagged (`User.timezone` is still hardcoded `"UTC"`) — not fixed here, not made worse.
8. **Capped at 20 events, no pagination** — matches the `/mail` (`INBOX_PAGE_SIZE = 20`) and `/notes` (uncapped list, but same "no pagination yet" philosophy) precedent. A single day realistically won't hit this, but the cap exists as the same safety net used elsewhere.
9. **Only `/calendar`'s own `SectionHeader` meta becomes dynamic** (`"${count} thing${count === 1 ? "" : "s"} today"`, mirroring `/notes`'s `${notes.length} total` pattern) — `AppFooter unreadCount` is left exactly as it is everywhere except `/mail`, per decision-note above; not revisited here.

## Assumptions

- **"Today" means the server's local calendar day**, not a per-user timezone preference — same standing gap as every prior phase that touched dates in this app.
- **No detail/edit view and no cancel-from-the-list affordance.** Tapping an event card does nothing new this phase (matches the mock). Editing/cancelling a real meeting stays chat-only, where `propose_update_meeting`/`propose_cancel_meeting` already work end-to-end with full approval gating — building a second, list-page entry point into the same destructive actions is explicitly out of scope and would need its own approval-UI consideration if ever built.
- **`showAskDisala`'s button stays non-functional** (decision #6) — a real follow-up, not silently dropped.
- **All-day events are shown as "All day" with no special multi-day handling** — an event spanning several days that overlaps today is returned by Google's own `events.list` and rendered like any other event; no extra logic reconciles a multi-day span into a single line.
- **Notes needs no changes.** Explicitly confirmed above rather than assumed — flagging it so it's clear this was checked, not skipped by oversight.
- **No new environment variable, no new dependency, no database migration** — `calendar.events` (already granted) already covers everything `events.list` returns, including `location` and attendee `displayName`.

## Files expected to change

Modified:
- `lib/integrations/calendar.ts` — extend the `CalendarEvent` type and `getEvents`'s mapping with `location: string` and `attendees[].displayName?: string` (decision #2). Every other exported function in this file is untouched.
- `lib/format-timestamp.ts` — add `formatEventTime`; `formatNoteTimestamp`/`formatEmailTimestamp` untouched.
- `app/calendar/page.tsx` — rewritten as an `async` Server Component following the `/notes`/`/mail` pattern: `auth()` gate, `getOrCreateInternalUser()`, `Promise.all([getHeaderIdentity(), getEvents(...)])` for today's window, branch on `GoogleApiResult` for not-connected/needs-reauth/error/empty states, compute `upNext` (decision #5), map through `formatEventTime`/`formatAttendeesLine` into `EventCard` props.

New:
- `lib/format-event.ts` — `formatAttendeesLine`.

Not touched (explicitly, per your instruction): `lib/integrations/gmail.ts`, `lib/integrations/gmail-mime.ts`, `lib/format-email.ts`, `app/mail/page.tsx`, `app/api/chat/route.ts`, `app/api/transcribe/route.ts`, `app/api/speak/route.ts`, `components/disala/voice-sheet.tsx`, `components/disala/use-voice-recorder.ts`, `lib/agent/*`, `lib/notes.ts`, `app/notes/**`, `lib/approvals.ts`, `components/disala/event-card.tsx`, `components/disala/bottom-nav.tsx`, `components/disala/app-footer.tsx`, `prisma/schema.prisma`, `package.json`.

## Functional requirements

- Signed in with Google connected: `/calendar` shows up to 20 of today's real events — real title, real time (or "All day"), real attendees/location line — in the order Google Calendar itself returns them.
- Exactly the first not-yet-started event of the day (if any) is marked "Up next" and shows the (decorative) "Ask Disala" button; no other event does.
- Zero events today (Google connected and healthy): an honest empty state ("Nothing on your calendar today" or similar), not an error and not a blank screen.
- Google not connected: a clear message with a link to `/settings/connections` — no crash, no stale/mock data.
- Google connection needs reauth: a distinct "reconnect" message with the same link.
- Any other failure (`RATE_LIMITED`, `PROVIDER_ERROR`, `INVALID_INPUT`): an honest "couldn't load your calendar right now" message.
- The section meta line reflects the real event count for today.

## Security considerations

- No new capability reachable by anything but the already-authenticated Server Component: `getEvents` is already used by the agent's `get_calendar_events` tool today, and this phase adds a second, equally-scoped caller (a page render), not a new write path or a new agent capability.
- `app/calendar/page.tsx` gates itself with `auth()` → `redirect("/sign-in")` before touching `getOrCreateInternalUser()`, identical to `/mail` and `/notes`.
- `userId` passed to `getEvents` comes only from the server-resolved `internalUser.id`, never from client input.
- Event titles, descriptions (not rendered), attendee emails/names, and locations are rendered as plain React text content — no `dangerouslySetInnerHTML`, so a hostile calendar event's title/attendee name cannot inject markup.

## AI/agent behavior

Not applicable — no agent tool, system prompt, or model-facing change. The agent's calendar/notes access is already complete and is not touched by this phase.

## Approval requirements

Not applicable — this is a read-only display page, matching `AGENTS.md` §7.3's "generally low-risk" list ("Reading today's calendar").

## Error handling

- `getEvents` already returns the existing `GoogleApiResult<T>` envelope and never throws for an expected failure — unchanged contract.
- The page renders the same three-way branch `/mail` established: connected+success, connected-but-provider-error (mapped from `result.error.code`), and not-connected/needs-reauth (with a `/settings/connections` link). No code path falls back to the old mock data under any failure.

## Acceptance criteria

- Against the real connected test account: `/calendar` shows real events matching what Google Calendar's own web UI shows for today, in the same order, with correctly formatted times/attendees/location.
- Exactly one event (the next upcoming one, if any remain today) shows "Up next"; a day where all events are already past shows none.
- Disconnecting Google and reloading `/calendar` shows the not-connected message with a working link; reconnecting restores real data.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.
- Grepping the diff confirms zero changes under `lib/integrations/gmail*`, `app/mail/**`, `components/disala/voice-sheet.tsx`, `components/disala/use-voice-recorder.ts`, and every `app/api/**` route shipped in prior phases.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`. Signed in with Google connected. Open `/calendar`. Confirm today's real events appear, matching Google Calendar's own web UI for the same day, including attendee names/locations where present.
2. Confirm only the next upcoming event (if today has one left) shows "Up next" and the "Ask Disala" button; earlier events in the day do not.
3. Create a test event later today with 3+ guests and a location in Google Calendar's own UI; reload `/calendar`; confirm it appears with the "+N more" attendee cap and the location shown.
4. Create (or use) an all-day event today; confirm it shows "All day" instead of a time.
5. Go to `/settings/connections`, disconnect Google, reload `/calendar`. Confirm the not-connected message and working link, and that reconnecting restores real data.
6. Confirm `/mail` and the chat/voice flows still behave exactly as before this phase (quick regression check, since no files under those paths should have changed at all).
7. Confirm `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

---

## Manual setup required before I can implement/test this

None — you're already connected with `calendar.events` granted from the original setup, which is all `events.list` requires (including the `location`/attendee `displayName` fields this phase adds to the mapping).

Is this good to execute?
