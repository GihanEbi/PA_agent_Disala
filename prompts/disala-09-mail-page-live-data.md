# Disala — Wire the /mail page to real Gmail data

## Goal

Replace the hardcoded four-item `EMAILS` mock array in `app/mail/page.tsx` with the signed-in user's real Gmail inbox, reusing the existing (already-working) Gmail integration layer. No new agent tools, no new approval type, no schema change — this is a read-only display page, the same category of work `disala-08` explicitly deferred as "orthogonal" (its own words: "It touches zero integration code, zero approval code, and zero agent code — it is `lib/integrations/*` read functions called from a Server Component, plus deciding what those pages show when Google isn't connected").

## Relevant skills

None specific to this phase — no new Google API surface is added (`gmail.users.messages.list` and `gmail.users.labels.get` are both already-documented endpoints this codebase already calls or is one line away from calling), no new dependency, no auth pattern beyond what `/notes` and `/settings/connections` already establish.

## Existing code inspected

- `app/mail/page.tsx` (full file) — the mock: a literal `EMAILS` array of 4 items (`initials`, `sender`, `subject`, `preview`, `time`, `needsReply`), rendered via `EmailCard`, with `SectionHeader meta="3 need a reply"` and `AppFooter unreadCount={3}` both hardcoded.
- `lib/integrations/gmail.ts` (full file) — `searchEmails(userId, input)` is fully functional today: Zod-validated input, `getAuthorizedGoogleClients` → `runGoogleApiCall` → returns `GoogleApiResult<EmailSummary[]>` where `EmailSummary = { id, threadId, from, subject, date, snippet, isUnread, isImportant }`. `date` is the raw `Date` header string from Gmail (RFC 2822), `from` is the raw `From` header (e.g. `"Priya Fernando" <priya@x.com>`), `snippet` is Gmail's own pre-truncated preview text. `buildGmailQuery` already supports `unreadOnly`/`importantOnly`/free-text `query`. No function today returns a total/unread *count* independent of a capped results page.
- `lib/integrations/google-client.ts` — confirmed `GoogleApiResult<T>` envelope and the six error codes (`NOT_CONNECTED`, `NEEDS_REAUTH`, `INSUFFICIENT_SCOPE`, `RATE_LIMITED`, `INVALID_INPUT`, `PROVIDER_ERROR`) this page must branch on for its empty/error states.
- `components/disala/email-card.tsx` (full file) — presentation-only, no data fetching. Props: `initials, sender, subject, preview, time, status?, replyLabel?, variant`. `status`/`replyLabel` are optional — omitting both already renders a clean card with no badge/button, so "read" emails need no new variant.
- `app/notes/page.tsx` (full file) — the established pattern for a data-backed page this phase copies: `auth()` → `redirect("/sign-in")` → `getOrCreateInternalUser()` → `redirect("/sign-in")` → `Promise.all([getHeaderIdentity(), <data call>])` → render.
- `lib/format-timestamp.ts` (full file) — `formatNoteTimestamp` already has the day-bucketing logic (`isSameDay`, "yesterday", "within 7 days → weekday name", "older → short date") but its *output strings* are shaped for notes ("Today, 9:12 PM"), not the mail mock's convention (today → time only, e.g. "8:41 AM"; older → "Yesterday" / weekday / short date, no time). The file's own doc comment already notes it's generic despite the name, so it's the natural home for a second exported function rather than a new file.
- `lib/disala-user.ts` — `getHeaderIdentity()` pattern for deriving a single-letter avatar initial from a Clerk user; no existing helper anywhere in the repo parses an RFC 5322 `From` header or derives initials from an arbitrary display name (the mock's `initials` were hand-typed per item).
- `components/disala/bottom-nav.tsx` — `unreadCount` renders as a raw number inside a fixed `size-4` (16px) circular badge (`{unreadCount}` with no formatting). It has only ever been called with the mock's `3`. A real inbox easily has 38+ unread (confirmed live against the connected test account while debugging the chat feature), which would visibly overflow that fixed-size circle.
- `app/page.tsx`, `app/calendar/page.tsx`, `app/notes/page.tsx` — each independently hardcodes its own `AppFooter unreadCount={3}`. Confirmed there is no shared/global source for this number today.
- `components/disala/voice-sheet-context.tsx` / `voice-sheet.tsx` — confirmed `openSheet()` takes no arguments and `VoiceSheet` always opens in `"voice"` mode with a fixed suggestion list; there is no existing mechanism to open the sheet in chat mode with a pre-filled or pre-sent message. Relevant because `EmailCard`'s `replyLabel` ("Ask Disala to reply") button is not wired to anything in the mock today — confirmed it has no `onClick` at all.
- `components/ui/badge.tsx` — the `attention` (gold) variant's own source comment literally says `// "Needs reply" — Attention (gold is action)`; no separate "unread" variant exists, and adding one is not necessary since the existing gold treatment reads equally well as "needs your attention because it's unread."

## Architectural decisions

1. **Read the inbox directly from the Server Component via `lib/integrations/gmail.ts` — no agent/tool involved.** This is a plain authenticated read of the signed-in user's own data, the same trust level as `/notes` reading `listNotes` or `/settings/connections` reading `getGoogleConnectedAccount`. `AGENTS.md` §7.3 only requires approval for consequential/external-effect actions; listing your own inbox is explicitly grouped with "generally low-risk" reads.
2. **Drop the fabricated "Needs reply" concept; use Gmail's real `isUnread` flag instead.** The mock's `needsReply: boolean` was hand-authored per item — Gmail's API has no "needs a reply" signal, and inventing one (e.g. "unread implies needs reply") would be presenting a guess as fact, which `AGENTS.md` §15/§7.5 rules out directly ("Disala must distinguish between known information and AI suggestions"). Concretely: an unread email gets `status="Unread"` (reusing the existing `attention` badge styling verbatim) and keeps the `replyLabel="Ask Disala to reply"` button; a read email gets neither. `isImportant` is fetched (it's already in `EmailSummary`) but not surfaced as a second badge this phase — `EmailCard` only supports one `status` slot, and adding a second badge type is a small UI decision with no reference to check it against (see Assumptions).
3. **New `getUnreadCount(userId)` in `lib/integrations/gmail.ts`, calling `gmail.users.labels.get({ userId: "me", id: "INBOX" })`.** Gmail's `Users.labels.get` on the system `INBOX` label returns `messagesUnread` directly — one lightweight call, exact count, independent of how many messages the list view actually renders. The alternative (counting `isUnread` across the rendered page) would silently under-report the moment the inbox has more unread mail than the page size. Follows the exact same `getAuthorizedGoogleClients` → `runGoogleApiCall` shape as every other read in the file; returns `GoogleApiResult<number>`.
4. **The list is capped at 20 most recent inbox messages (`query: "in:inbox"`, `maxResults: 20`), no pagination.** Matches this app's existing "no pagination yet, add it when it's a real problem" convention (`/notes`'s `listNotes`, `disala-08`'s `/approvals` `take: 200`). `in:inbox` is added explicitly because `searchEmails` with no query scopes across all mail, not just the inbox the section header claims to show.
5. **`unreadCount` passed to `BottomNav`/`AppFooter` is formatted, not raw, to protect the existing fixed-size badge.** `formatBadgeCount(n)` → `n > 9 ? "9+" : String(n)`. This is a one-line numeric-formatting guard, not a layout/visual redesign (`AGENTS.md` §3 forbids restyling beyond a reference, not preventing an existing fixed-size element from overflowing with real data it was never tested against). If you'd rather see the exact number regardless of overflow, say so and I'll drop this.
6. **Only `/mail`'s own `SectionHeader` meta and `AppFooter unreadCount` get the real number this phase.** `app/page.tsx`, `app/calendar/page.tsx`, `app/notes/page.tsx` keep their hardcoded `unreadCount={3}` — making the badge consistent everywhere would mean every other page also fetching Gmail on every render, which is real, separate work (probably wants a shared/cached value, not a fresh Gmail call per page) and out of scope for "show the emails in the email page." Flagged clearly in Assumptions so the resulting inconsistency isn't mistaken for an oversight.
7. **`formatEmailTimestamp` is added to `lib/format-timestamp.ts` as a second export**, reusing the file's existing `isSameDay` helper, producing the mock's original convention exactly: today → time only ("8:41 AM"), yesterday → `"Yesterday"`, within 7 days → weekday name, older → short date (`"Aug 14"`). `formatNoteTimestamp` is untouched.
8. **A new `lib/format-email.ts`** (pure functions, no `server-only`, no I/O) exports `parseFromHeader(raw: string): { name: string; email: string }` (strips a quoted display name from `"Name" <addr>`, falls back to the bare address) and `getInitials(name: string): string` (first letter of up to the first two words, uppercased; falls back to the first letter of an email local-part when there's no display name). Kept separate from `lib/format-timestamp.ts` since it's a distinct concern (header parsing, not time formatting), and separate from `lib/integrations/gmail.ts` since it has no Google/server dependency and there's no reason to force it server-only.
9. **The "Ask Disala to reply" button stays decorative this phase — not wired to open chat with a pre-filled reply.** It has no `onClick` in the mock today, so this is not a regression. Wiring it for real requires `VoiceSheetContext.openSheet` to accept an optional pre-filled/auto-sent message and `VoiceSheet`/`ChatComposer` to consume it — a self-contained enhancement to the global chat sheet, not something that belongs bundled into "make the mail list show real data." Flagged as a natural, separate follow-up.
10. **No detail/read view.** Tapping an email card does nothing new this phase, matching the mock (no `onClick` there either). Reading a full email body remains available only through chat's existing `get_email` tool. Flagged in Assumptions as a real product gap worth a future prompt, not silently decided.

## Assumptions

- "Inbox" means Gmail's `in:inbox` scope (decision #4) — archived mail and other labels are excluded, matching the page's own "Inbox" heading.
- The visible inconsistency between `/mail`'s real unread badge and the other three pages' hardcoded `3` (decision #6) is accepted for this phase. Unifying it is a separate, small follow-up once there's a sensible place to compute/cache the count once per request instead of once per page.
- No click-through to a full email view exists yet (decision #10) — full-body reading stays chat-only.
- "Ask Disala to reply" stays non-functional this phase (decision #9).
- `isImportant` is fetched but not displayed (decision #2) — no second badge is invented for it.
- Email timestamps render in the server/browser's local time zone, not a per-user stored preference — same standing gap `disala-07`/`disala-08` already flagged for `User.timezone` (still hardcoded `"UTC"`).
- No new environment variable, no new dependency, no database migration, no scope change — `gmail.readonly` (already granted) covers both `messages.list` and `labels.get`.

## Files expected to change

Modified:
- `app/mail/page.tsx` — rewritten as an `async` Server Component following the `/notes` pattern: `auth()` gate, `getOrCreateInternalUser()`, `Promise.all([getHeaderIdentity(), searchEmails(...), getUnreadCount(...)])`, branch on both `GoogleApiResult`s for not-connected/needs-reauth/error/empty states, map `EmailSummary[]` through `parseFromHeader`/`getInitials`/`formatEmailTimestamp` into `EmailCard` props.
- `lib/integrations/gmail.ts` — add `getUnreadCount(userId): Promise<GoogleApiResult<number>>`; extend the export list. `searchEmails`/`getEmail`/`createDraft`/`sendEmail` untouched.
- `lib/format-timestamp.ts` — add `formatEmailTimestamp(date, now?)`; `formatNoteTimestamp` untouched.

New:
- `lib/format-email.ts` — `parseFromHeader`, `getInitials`.

Not touched: `lib/integrations/google-client.ts`, `lib/integrations/gmail-mime.ts`, `lib/agent/tools.ts`, `lib/agent/system-prompt.ts`, `app/api/chat/route.ts`, `lib/approvals.ts`, `components/disala/email-card.tsx`, `components/disala/bottom-nav.tsx` (only the *value* passed into it changes, not the component), `components/disala/voice-sheet*.tsx`, `prisma/schema.prisma`, `package.json`, any other page under `app/`.

## Functional requirements

- Signed in with Google connected: `/mail` shows up to 20 of the user's real, most-recent inbox messages — real sender name/initials, real subject, real Gmail snippet preview, real relative time label, newest first.
- Each unread message shows an "Unread" badge and the "Ask Disala to reply" button (decorative, per decision #9); read messages show neither.
- The section meta line and the bottom-nav badge both show the real inbox unread count (via `getUnreadCount`), formatted per decision #5 above 9.
- Zero messages in the inbox (but Google connected and healthy): an honest empty state ("Your inbox is empty" or similar), not an error and not a blank screen.
- Google not connected: a clear message explaining Gmail isn't connected, with a link to `/settings/connections` — no crash, no stale/mock data shown.
- Google connection needs reauth (`NEEDS_REAUTH`): a clear "reconnect your Google account" message with the same link — distinct wording from "not connected" so the user knows they connected once but it lapsed.
- Any other failure (`RATE_LIMITED`, `PROVIDER_ERROR`, `INVALID_INPUT`, or `getUnreadCount` failing independently of `searchEmails`): an honest "couldn't load your inbox right now" message. The list and the unread badge fail independently — a badge-count failure must not blank out an otherwise-successful list, and vice versa.

## Security considerations

- No change to what's reachable: this phase adds one new *read* function (`getUnreadCount`) behind the exact same `getAuthorizedGoogleClients`/`hasUsableGoogleConnection` gate every existing read already uses. No new write path, no new agent tool, nothing reachable from a request body the model or the browser controls beyond the already-authenticated session.
- `app/mail/page.tsx` gates itself with `auth()` → `redirect("/sign-in")` before touching `getOrCreateInternalUser()`, matching `/notes` and `/settings/connections` exactly (`proxy.ts` still protects nothing globally — unchanged, standing gap).
- `userId` passed to `searchEmails`/`getUnreadCount` comes only from the server-resolved `internalUser.id`, never from a query param, header, or client input — no cross-user data exposure surface is introduced.
- Email content (sender, subject, snippet) is rendered directly into the page as already-trusted-by-React JSX text content (no `dangerouslySetInnerHTML` anywhere in this change), so a hostile email subject/snippet cannot inject markup.

## AI/agent behavior

Not applicable — no agent tool, system prompt, or model-facing surface changes in this phase.

## Approval requirements

Not applicable — nothing in this phase creates, changes, or cancels anything external. It is a read-only display page, matching `AGENTS.md` §7.3's own "generally low-risk" list ("Reading an email", "Summarizing an email").

## Error handling

- `searchEmails` and `getUnreadCount` both return the existing `GoogleApiResult<T>` envelope; neither is allowed to throw for an expected failure (unchanged contract from the rest of `lib/integrations/gmail.ts`).
- The page renders three independent states per data source it needs: connected+success, connected-but-provider-error, and not-connected/needs-reauth — mapped from `result.error.code` (`NOT_CONNECTED` | `NEEDS_REAUTH` → a "connect/reconnect" prompt with a `/settings/connections` link; anything else → a generic honest failure message). No code path renders the old mock data as a fallback under any failure — showing fabricated emails when the real fetch failed would be exactly the false-success `AGENTS.md` §7.5 forbids.
- If `searchEmails` succeeds but `getUnreadCount` fails (or vice versa), each region of the page degrades independently — e.g. the list renders normally while the badge/meta count shows a small inline "—" or is simply omitted, rather than the whole page failing.

## Acceptance criteria

- Against the real connected test account: `/mail` shows real sender names/subjects/snippets matching what Gmail's own web UI shows for the same inbox, newest first, capped at 20.
- Unread count shown in the section meta and the bottom-nav badge matches the real unread count Gmail's own UI reports for the inbox (allowing for the `9+` cap per decision #5).
- Disconnecting Google (`/settings/connections` → Disconnect) and reloading `/mail` shows the not-connected message and a working link to `/settings/connections` — no stale data, no crash.
- Revoking Google access from the Google account's own "Third-party apps & services" page, then reloading `/mail`, shows the needs-reconnect message (and confirms `ConnectedAccount.status` flips to `NEEDS_REAUTH`, consistent with the existing `runGoogleApiCall` behavior).
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`. Signed in with Google connected (already the case from this session's debugging). Open `/mail`. Confirm the emails shown match your real inbox (compare sender/subject against Gmail's own web UI for the same account) and that unread ones show the "Unread" badge.
2. Confirm the section meta text and the Mail tab's badge count match your real unread count (or show "9+" if it's higher, per decision #5).
3. Send yourself a new test email, reload `/mail`, confirm it appears at the top and the unread count increases by one.
4. Open the email in Gmail's own web UI (marking it read), reload `/mail`, confirm the "Unread" badge is gone for that message and the count decreases.
5. Go to `/settings/connections`, click Disconnect, reload `/mail`. Confirm the not-connected message appears with a working link back to Connections, and no stale email data is shown.
6. Reconnect Google from that link, reload `/mail`, confirm real data returns.
7. In your Google account's "Third-party apps & services" settings, revoke Disala's access; reload `/mail` without reconnecting first. Confirm the needs-reconnect message appears (distinct wording from step 5's not-connected message).
8. Confirm `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

---

## Manual setup required before I can implement/test this

None — you're already connected with `gmail.readonly` granted from the earlier setup, which is all `messages.list` and `labels.get` require.

Is this good to execute?
