# Disala — Wire the Home page to real data

## Goal

Replace the hardcoded `INSIGHTS` array (mail/calendar/notes summary rows) and the hardcoded `unreadCount={3}` in `app/page.tsx` with the signed-in user's real Gmail, Calendar, and Notes data, reusing the exact integration/lib functions already powering `/mail`, `/calendar`, and `/notes`. This is the follow-up `disala-01-home.md` explicitly deferred ("Any real Gmail/Calendar/Notes data... this is presentation-layer only, using static sample content. They will be replaced by real Gmail/Calendar/Notes/user data in later, separate prompts once those integrations exist"). No new agent tools, no new approval type, no schema change, no new UI components.

## Relevant skills

None specific — no new Google API surface, no new dependency. Pure reuse of `lib/integrations/gmail.ts`, `lib/integrations/calendar.ts`, and `lib/notes.ts`, following the exact Server Component pattern already established by `/mail` and `/calendar`.

## Existing code inspected

- `app/page.tsx` (full file) — currently has **no `auth()` gate at all** (unlike `/mail`, `/calendar`, `/notes`), and a literal `INSIGHTS` array of 3 items (mail/calendar/notes) plus `AppFooter unreadCount={3}`, per `disala-01-home.md`'s own documented Assumptions ("Sample data only... will be replaced... in later, separate prompts").
- `app/mail/page.tsx` and `app/calendar/page.tsx` (full files) — the established pattern this phase copies: `auth()` → `redirect("/sign-in")` → `getOrCreateInternalUser()` → `redirect("/sign-in")` → `Promise.all([getHeaderIdentity(), ...data calls])` → branch on each `GoogleApiResult` independently for connect/reauth/error/empty states, never falling back to mock data.
- `lib/integrations/gmail.ts` — `searchEmails(userId, { unreadOnly, maxResults })` and `getUnreadCount(userId)` (labels.get on `INBOX`, exact count) both already used by `/mail`. `parseFromHeader`/`getInitials` in `lib/format-email.ts` already turn a raw `From` header into a display name.
- `lib/integrations/calendar.ts` — `getEvents(userId, { timeMin, timeMax, maxResults })` already used by `/calendar`'s "today" query (`startOfToday` → `startOfTomorrow`). `formatEventTime` in `lib/format-timestamp.ts` already formats an event's `start` the same way `/calendar` does.
- `lib/notes.ts` — `listNotes(userId)`, a plain Prisma `findMany` ordered by `updatedAt desc`, no `GoogleApiResult` envelope (not a Google-backed read, can't fail the same way — only an unexpected DB error, which `/notes` doesn't special-case either, so this phase won't invent handling beyond what `/notes` already does).
- `components/disala/insight-row.tsx` (full file) — presentational only: `icon`, `tint`, `title`, `subtitle` (truncated to one line via `truncate`), optional `href`. No loading/error-specific variant — connection problems have to be expressed through `title`/`subtitle` text, same as the mock's shape.
- `prompts/disala-09-mail-page-live-data.md` (decision #2) — explicitly rejected inventing a "needs reply" concept; Gmail only exposes `isUnread`/`isImportant`. The current mock's mail row title, "3 emails need your reply," makes exactly that unsupported claim and will be replaced with real unread-count language instead.
- `prompts/disala-09-mail-page-live-data.md` (decision #6) — flagged that `/`, `/calendar`, `/notes` all independently hardcode `AppFooter unreadCount={3}` and deliberately left `/calendar`/`/notes` alone as "separate, small follow-up." This phase fixes the home page's copy of that gap (since it's already being touched for other reasons) but leaves `/calendar` and `/notes` untouched — fixing every page's footer badge is a separate, unrelated change.

## Architectural decisions

1. **Add the same auth gate as every other data-backed page.** `app/page.tsx` currently renders for anyone, gated only by whatever `middleware`/layout-level protection exists elsewhere; every other data page defends itself independently with `auth()` → `redirect("/sign-in")` → `getOrCreateInternalUser()` → `redirect("/sign-in")`. Home page is being changed to touch real per-user data now, so it needs the same self-defense, matching the codebase's existing standing pattern (no global gate exists to rely on instead).
2. **Fetch all three sources concurrently via `Promise.all`, same as `/mail`/`/calendar` do for their own two-call cases** — `getHeaderIdentity()`, `getUnreadCount(...)`, `searchEmails(..., { unreadOnly: true, maxResults: 3 })`, `getEvents(..., today..tomorrow)`, `listNotes(...)`. Five concurrent calls, no sequential waterfall.
3. **Mail row: replace "needs your reply" with real unread-count language.** Per decision above, there's no honest "needs reply" signal. New copy:
   - Unread count > 0: title `"N unread emails"` (singular "1 unread email"), subtitle built from up to 3 unread senders' names (via `parseFromHeader` on `searchEmails({ unreadOnly: true, maxResults: 3 })`) — `"Priya and LankaHost"` (2 names), or `"Priya, LankaHost, and 1 other"` (more than 2, using the real total from `getUnreadCount` for the "N other" tail, not just what fit in the 3-item sample).
   - Unread count === 0: title `"Inbox zero"`, subtitle `"No unread emails"`.
   - `getUnreadCount` fails: title `"Connect Gmail"` / `"Gmail needs attention"` (see decision 5), subtitle a short connection message. `href` stays `/mail` either way — that page already owns the full connect/reconnect flow.
4. **Calendar row: show the next upcoming event today, or an honest "nothing left" state.** Reuses `/calendar`'s own `startOfToday`/`startOfTomorrow` window and its "first event that hasn't started yet" logic:
   - Has an upcoming (not-yet-started) event today: title `"<summary> at <formatEventTime(start)>"`, subtitle `"N things today"`.
   - Has events today but all already started/passed: title `"No more meetings today"`, subtitle `"N things today"`.
   - No events today: title `"Nothing on your calendar"`, subtitle `"No meetings today"`.
   - `getEvents` fails: title `"Connect Calendar"`, subtitle a short connection message.
5. **Notes row: real count + up to 2 titles.**
   - `listNotes` returns rows: title `"N notes saved"` (or `"1 note saved"`), subtitle = first 2 notes' `title` (falling back to the first ~30 characters of `content` when a note has no title, trimmed at a word boundary) joined `", "`, plus `", and N more"` if there are more than 2.
   - Zero notes: title `"No notes yet"`, subtitle `"Tap to add one"`.
   - No error branch — `listNotes` isn't a `GoogleApiResult`-wrapped external call; an unexpected DB error surfaces the same way it already would on `/notes` (Next.js error boundary), not specially handled here.
6. **Connection-failure copy is short and title-appropriate, not the multi-sentence prose `/mail`/`/calendar` use in their full-page error states.** `InsightRow`'s `title` has no line-wrap protection the way `/mail`/`/calendar`'s dedicated error boxes do, so failure titles stay as short as the happy-path titles (`"Connect Gmail"` / `"Connect Calendar"`, ~15 chars) with the explanation in the (truncating) subtitle — e.g. `"Connect your Google account"` for `NOT_CONNECTED`/`NEEDS_REAUTH`, `"Couldn't load right now"` for anything else. This reuses the same `GoogleApiErrorCode` branching `/mail`/`/calendar` already do, just condensed for a one-line row instead of a full message box.
7. **Footer `unreadCount` uses the real, capped count** (`Math.min(count, 9)`, same `BADGE_COUNT_CAP = 9` local helper `/mail` already defines locally — duplicated here rather than extracted into a shared util, matching the codebase's existing convention of not sharing this 3-line helper across `/mail` either), `undefined` when `getUnreadCount` failed (matches `/mail`'s own fallback behavior, which hides rather than guesses). **Only the home page's footer changes** — `/calendar` and `/notes` keep their existing hardcoded `unreadCount={3}`, an already-documented, deliberately separate gap (see Existing code inspected).
8. **Each of the three rows fails independently.** A Gmail outage must not blank out the calendar or notes rows, and vice versa — each row's copy is derived purely from its own `GoogleApiResult`/data, matching `/mail`'s decision that "a badge-count failure must not blank out an otherwise-successful list."

## Assumptions

- The mail row's "N other(s)" tail is computed from the real `getUnreadCount` total, not from how many of the 3 sampled unread messages happen to have distinct sender names — if two of the three samples are from the same sender, the displayed names still reflect the sample, and the "other" count is `unreadTotal - namesShown`, which could occasionally read a little oddly (e.g. same sender counted once by name but its second message still counted in the numeric total). This mirrors real inbox apps' typical simplification and isn't worth a second query to de-duplicate perfectly.
- No click-through changes: all three rows keep linking to `/mail`, `/calendar`, `/notes` respectively (`InsightRow`'s existing `href` prop), matching `disala-01`'s original layout — this phase only changes the row copy and the footer badge value, not the page structure.
- Timestamps/"today" boundaries use the server's local time zone, same standing gap already flagged in `disala-09`/`disala-12` for `User.timezone` (still hardcoded `"UTC"`, never collected from the user).
- No pagination/caching added — each request refetches Gmail/Calendar/Notes fresh, same as every other page today (no shared per-request cache exists to reuse).
- Suggestions/priorities and Reminders are **not** part of this phase — those Prisma models exist but have no lib functions, agent tools, or UI anywhere in the codebase yet (confirmed via repo search); inventing a priorities/reminders row here would mean building a new feature, not "replacing mock data with real data." AGENTS.md's example home screen ("Priority 1: Prepare the proposal...") is aspirational product copy, not something this codebase implements today — out of scope, flagged as a real future prompt if wanted.

## Files expected to change

Modified:
- `app/page.tsx` — rewritten as an `async` Server Component: `auth()` gate, `getOrCreateInternalUser()`, `Promise.all([getHeaderIdentity(), getUnreadCount(...), searchEmails(...), getEvents(...), listNotes(...)])`, three small local formatter functions (mail/calendar/notes row content, mirroring `/mail`'s/`/calendar`'s local `connectionMessage`/`findUpNextId`/`capBadgeCount` helpers) replacing the static `INSIGHTS` array, real `AppFooter unreadCount`.

Not touched: `lib/integrations/gmail.ts`, `lib/integrations/calendar.ts`, `lib/notes.ts`, `lib/format-email.ts`, `lib/format-timestamp.ts`, `components/disala/insight-row.tsx`, `components/disala/app-header.tsx`, `components/disala/app-footer.tsx`, `components/disala/bottom-nav.tsx`, `app/mail/page.tsx`, `app/calendar/page.tsx`, `app/notes/page.tsx`, `prisma/schema.prisma`, `lib/agent/*`, any approval code.

## Functional requirements

- Signed out: `/` redirects to `/sign-in` (new — previously rendered for anyone).
- Signed in, Google connected, real inbox/calendar/notes data present: all three insight rows show real counts/names/titles per decisions 3–5, and the footer badge shows the real (capped) unread count.
- Zero unread mail / zero events today / zero notes: each row shows its own honest empty-state copy (decisions 3–5), never the old mock strings.
- Google not connected or needing reauth: mail and/or calendar rows show a short connect/reconnect prompt (decision 6); the notes row is unaffected (not a Google-backed source).
- Any other Gmail/Calendar failure: the affected row shows a short honest failure message; the other rows keep rendering normally (decision 8).
- No path renders any of the old hardcoded strings ("3 emails need your reply", "Design sync at 9:30 AM", "3 notes saved", "Kavindu's birthday ideas...") under any condition.

## Security considerations

- No new read/write surface — reuses `getUnreadCount`/`searchEmails`/`getEvents`/`listNotes` exactly as `/mail`/`/calendar`/`/notes` already call them, behind the same `getAuthorizedGoogleClients` gate.
- `app/page.tsx` gains the same `auth()` → `redirect("/sign-in")` self-defense every other data page already has — closes the (previously accepted, since it showed only mock data) gap where `/` rendered without checking authentication.
- `userId` passed to every call is `internalUser.id` resolved server-side from the authenticated session, never from client input.

## AI/agent behavior

Not applicable — no agent tool, system prompt, or model-facing surface changes.

## Approval requirements

Not applicable — read-only display, same category as `/mail`/`/calendar`/`/notes` (AGENTS.md §7.3 "generally low-risk": reading email, reading calendar, searching notes).

## Error handling

- `getUnreadCount`, `searchEmails`, `getEvents` all return the existing `GoogleApiResult<T>` envelope; each failure is branched on independently (decision 8) and rendered as short row copy (decision 6) — never as a fallback to the old mock data.
- `listNotes` has no result envelope; an unexpected DB error surfaces the same way `/notes` already lets it (unhandled → Next.js error boundary), not newly special-cased here.

## Acceptance criteria

- Against the real connected test account: the mail row's unread count and sender names match Gmail's own unread state; the calendar row matches the real next event (or "no more meetings"/"nothing today"); the notes row's count and titles match `/notes`.
- Footer badge on `/` matches the real capped unread count, and updates when mail is read/received (same as `/mail`'s own badge already does).
- Disconnecting Google and reloading `/` shows connect-prompt copy on the mail and calendar rows, with the notes row unaffected.
- Signed out, visiting `/` redirects to `/sign-in`.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`. Signed out, visit `/` — confirm redirect to `/sign-in`.
2. Sign in with Google connected. Open `/`. Confirm the mail row's count/names, calendar row's next-event/count, and notes row's count/titles all match what `/mail`, `/calendar`, `/notes` themselves show.
3. Confirm the footer's Mail badge matches the mail row's unread count.
4. Send yourself a new email, reload `/` — confirm the mail row and footer badge both increase by one.
5. Mark all mail read in Gmail's own web UI, reload `/` — confirm the mail row shows the "Inbox zero" empty state.
6. Let all of today's events pass (or test with a day that has none), reload `/` — confirm the calendar row shows "No more meetings today" or "Nothing on your calendar" as appropriate.
7. Delete all notes, reload `/` — confirm the notes row shows "No notes yet".
8. Go to `/settings/connections`, disconnect Google, reload `/` — confirm the mail and calendar rows show connect-prompt copy while the notes row is unaffected. Reconnect and confirm real data returns.
9. Confirm `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

---

Is this good to execute?
