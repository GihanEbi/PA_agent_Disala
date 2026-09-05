# Disala — Backend Phase 1: Clerk user sync + Google account connection (Gmail + Calendar)

## Goal

Lay the foundation the rest of the backend depends on:

1. Keep our internal `User` table in sync with Clerk (nothing writes to it today — every other model FKs to `User.id`, so nothing in `AGENTS.md` §8 can work until this exists).
2. Let a signed-in user connect and disconnect their Google account, granting exactly the Gmail + Calendar scopes Disala will need, through Clerk's official external-account flow rather than a hand-rolled OAuth implementation.
3. Persist connection state into our own `ConnectedAccount` table (status/scopes/which Google email is connected) so later phases (Gmail tools, Calendar tools, approvals, audit trail) can query it without round-tripping to Clerk on every request.

Out of scope for this prompt (deferred to later phases per your "phase it" decision):
- Any actual Gmail/Calendar API calls (search, read, send, create/update/cancel events) — this prompt only gets a usable access token *reachable*, it doesn't use one yet.
- Notes (native, DB-backed — separate prompt, no OAuth involved).
- The AI agent, tool layer, chat endpoint, and approval execution.
- Global route protection (`proxy.ts` currently enforces no auth anywhere — see "Assumptions").

## Relevant skills

- `clerk-nextjs-patterns` — server vs. client auth (`auth()` vs. hooks), protecting Server Actions.
- `clerk-webhooks` — `verifyWebhook`, event payload shapes, making the webhook route public, local testing via `clerk webhooks listen`.
- `supabase-postgres-best-practices` — for the schema/migration change.

Also consulted directly (not a packaged skill, verified live via Clerk's docs during this session since this is a fast-moving API surface):
- Clerk's "per-user OAuth scopes" pattern (`externalAccount.reauthorize({ additionalScopes })`) and "manage SSO connections" custom flow (`user.createExternalAccount({ strategy, redirectUrl, additionalScopes })`, `externalAccount.destroy()`, both wrapped in `useReverification`).
- `getUserOauthAccessToken(userId, provider)` on the Backend SDK (used by later phases, not this one).

## Existing code inspected

- `prisma/schema.prisma` — `User` (clerkId unique, email unique), `ConnectedAccount` (currently has `accessToken`/`refreshToken` String columns with a comment "ciphertext only — implemented in the provider integration prompt", `scopes String[]`, `status ConnectedAccountStatus`, `tokenExpiresAt`). No migrations exist yet beyond the initial one from `prompts/disala-03-supabase-db-connection.md`.
- `lib/db.ts` — Prisma singleton over `@prisma/adapter-pg`, already wired to Supabase.
- `lib/disala-user.ts` — only reads Clerk's `currentUser()` for header display; never touches Prisma.
- `proxy.ts` — `clerkMiddleware()` called with **no callback**, so nothing is actually protected today (confirmed: this is the existing, previously-approved state per `prompts/disala-02-05-mail-calendar-notes-voice.md`'s explicit "no auth-gating added" decision, not a new gap I'm introducing).
- `components/disala/app-header.tsx` — already renders Clerk's `<UserButton>` when signed in. `UserButton` supports custom `<UserButton.MenuItems>` for adding links, which is the natural, already-present place to surface a "Connections" entry point (no new header chrome needed).
- `package.json` — `@clerk/nextjs@^7.8.4` (current major; supports `createExternalAccount`, `reauthorize`, `useReverification`, `verifyWebhook`). No `svix` needed directly — `@clerk/nextjs/webhooks` wraps it.
- Searched the whole repo: no existing route reads/writes `db.user` anywhere outside the Prisma-generated client itself, and no webhook route exists. Confirmed by grep.
- Confirmed live (Clerk docs, fetched during this session) that Clerk's shared/dev Google OAuth credentials cannot grant sensitive scopes like Gmail/Calendar — the Clerk Dashboard's Google SSO connection must be switched to **custom credentials** (your own Google Cloud OAuth Client ID/Secret) for `additionalScopes` beyond basic profile/email to actually be granted. This is a Dashboard + Google Cloud Console setup step, not code — see the closing section.

## Architectural decisions

1. **Google account connection goes through Clerk, not a hand-rolled OAuth flow.** `AGENTS.md` §4 says "do not create custom authentication or OAuth implementations when an official provider flow is available." Clerk is this project's official auth provider and ships a documented, supported flow for exactly this case: linking an *additional* external account (not necessarily the sign-in method) with custom scopes, and later fetching a fresh access token for it server-side. Concretely:
   - **Connect**: `user.createExternalAccount({ strategy: 'oauth_google', redirectUrl: '/settings/connections', additionalScopes: GOOGLE_OAUTH_SCOPES })` from a client component, wrapped in `useReverification` (Clerk's step-up re-auth before sensitive account changes — appropriate here since this grants access to email/calendar).
   - **Reauthorize** (when scopes are insufficient or Google-side access was revoked): `externalAccount.reauthorize({ redirectUrl, additionalScopes: GOOGLE_OAUTH_SCOPES })`, same wrapping.
   - **Disconnect**: `externalAccount.destroy()`, same wrapping.
   - **Redirect handling**: `redirectUrl` points back at `/settings/connections` itself (Clerk's own docs example does the same) — no separate `/sso-callback` route is needed for this flow; Clerk's frontend SDK completes it automatically when the page reloads with Clerk's own status params in the URL.
   - **Reading a usable token**: not built in this prompt, but the contract later phases will rely on is `(await clerkClient()).users.getUserOauthAccessToken(clerkUserId, 'oauth_google')`, called at the moment a Gmail/Calendar tool actually needs one. Per Clerk's docs, this call itself triggers a refresh if the cached token is stale — **Clerk holds and refreshes the real Google refresh token; our app never sees it.** This is strictly better than the schema's original plan (encrypt/decrypt tokens ourselves) from a security standpoint: the actual secret never touches our database or server memory beyond the single request that uses it.
2. **`ConnectedAccount.accessToken`/`refreshToken`/`tokenExpiresAt` are removed from the schema.** They're now meaningless — Clerk owns the real credential, and Clerk's `ExternalAccount` type doesn't expose an expiry we could mirror anyway. Keeping unused nullable columns "for later" is exactly the speculative-code pattern `AGENTS.md`/your own conventions tell me to avoid. `ConnectedAccount` becomes a **synced read-model** of Clerk's connection state, not a credential store: `provider`, `providerAccountId` (Clerk's `providerUserId`), a new `providerEmail String?` (Clerk's `emailAddress`, for "Connected as you@gmail.com" in the UI), `scopes String[]` (parsed from Clerk's space-delimited `approvedScopes`), `status`.
   - `status` mapping: Clerk `verification.status === 'verified'` → `ACTIVE`; anything else while a Google external account still exists → `NEEDS_REAUTH`; no Google external account on the Clerk user → existing row (if any) set to `REVOKED`, never hard-deleted (keeps the audit trail per `AGENTS.md` §16).
3. **Sync strategy: webhook as source of truth for `User`, on-demand sync for `ConnectedAccount`.**
   - `User` rows are created/updated/deleted from a Clerk webhook (`user.created`/`user.updated`/`user.deleted`) — the standard, documented pattern, and it's the only thing that also correctly handles profile edits and account deletion, not just first sign-in.
   - Webhooks are **eventually consistent** (Clerk's own guidance: don't rely on webhook delivery inside a synchronous flow like onboarding). A brand-new user could click "Connect Google" before the webhook fires. So every code path that needs the internal `User.id` calls a small `getOrCreateInternalUser()` helper that upserts by `clerkId` on demand, using the already-available Clerk session — idempotent, and it's what the webhook would have written anyway. The webhook stays the primary path (also handles updates/deletes, which the lazy path doesn't).
   - `ConnectedAccount` has no separate webhook in this prompt (Clerk does have webhook-like events for this, but adding a second event-driven sync path is more machinery than one screen needs right now). Instead, `/settings/connections`'s server component and the post-action Server Action both call `syncGoogleConnectedAccount()`, which reads Clerk's live `externalAccounts` for that user server-side and upserts our row. This guarantees the DB cache is correct exactly when it's rendered or right after a connect/reauthorize/disconnect completes — the realistic points where it matters. Real-time sync via webhook can be added later if some other feature needs it (e.g. a background job checking connection health) without touching this design.
4. **Google OAuth scopes (least privilege, per `AGENTS.md` §15/§16):**
   - `https://www.googleapis.com/auth/gmail.readonly` — search/read the inbox.
   - `https://www.googleapis.com/auth/gmail.compose` — create, read, update, delete drafts, **and send** (this scope covers send-via-draft and direct send without also granting `gmail.modify`'s broader label/delete-everything access). Deliberately not requesting `gmail.send` *and* `gmail.compose` together — `compose` alone covers every drafting/sending capability `AGENTS.md` §9 describes.
   - `https://www.googleapis.com/auth/calendar.events` — read/create/update/cancel events (not the broader `calendar` scope, which also manages calendar list settings/ACLs we don't need).
   - `https://www.googleapis.com/auth/calendar.freebusy` — free/busy queries for "find available time," narrower than `calendar.readonly`.
   - All four are requested together in one `additionalScopes` array on a single "Connect Google" action — Google grants them as one consent screen/one connection either way, so splitting "Connect Gmail" and "Connect Calendar" into two separate connect buttons would be a UI fiction, not a real permission boundary. The Connections page will present it as one "Google" card listing what it unlocks (Gmail + Calendar), not two.
5. **Entry point**: a `<UserButton.MenuItems><UserButton.Link label="Connections" href="/settings/connections" .../></UserButton.MenuItems>` added inside the existing `<UserButton>` in `app-header.tsx` — reuses Clerk's existing menu rather than adding new header UI, consistent with "reuse existing components before adding new ones."
6. **New route `/settings/connections`** is the only route this prompt auth-gates explicitly (`const { userId } = await auth(); if (!userId) redirect('/sign-in')`), and the only Server Action added checks `auth()` at the top per `clerk-nextjs-patterns`. This does **not** change `proxy.ts`'s current no-op middleware — see Assumptions.

## Assumptions

- **Global route protection is out of scope here.** `proxy.ts` today protects nothing (a prior, already-approved decision). Flipping it to protect-by-default would silently change behavior for `/`, `/mail`, `/calendar`, `/notes`, `/style-guide` — pages a previous prompt explicitly decided to leave ungated. I'm only adding auth checks at the new touchpoints this prompt introduces (`/settings/connections`, its Server Action, the webhook route via signature verification instead of session auth). I'd recommend a dedicated future prompt to add real `auth.protect()` gating across the app before this goes anywhere near real users — flagging this, not fixing it now.
- **Single Google connection per user.** A user connects one Google account for both Gmail and Calendar. Multiple Google accounts per user, or connecting a Google account already linked to a *different* Disala user, are not handled specially — Clerk's own uniqueness rules apply, and this isn't a scenario `AGENTS.md` calls out.
- **`useReverification` requires "Reverification" to be enabled in the Clerk Dashboard** (a per-instance setting). If it's off, `createExternalAccount`/`destroy`/`reauthorize` will still work as calls but Clerk simply won't prompt for step-up auth. I'm coding against the documented API either way; whether to enable that Dashboard setting is your call, noted below.
- **Not testable end-to-end without your Google Cloud OAuth Client ID/Secret wired into Clerk's Dashboard** (custom credentials, required for Gmail/Calendar scopes — see the closing section). I can build and unit-verify everything except the live consent screen without it.

## Files expected to change

New:
- `app/api/webhooks/clerk/route.ts` — `user.created`/`user.updated`/`user.deleted` handler.
- `lib/get-or-create-user.ts` — `getOrCreateInternalUser()`, the lazy-sync fallback.
- `lib/google-oauth.ts` — exports `GOOGLE_OAUTH_SCOPES` (the 4 scope strings, documented above).
- `lib/connected-accounts.ts` — `syncGoogleConnectedAccount(internalUserId, clerkUserId)`; `getGoogleConnectedAccount(internalUserId)`.
- `app/settings/connections/page.tsx` — server component: auth-gate, `getOrCreateInternalUser`, `syncGoogleConnectedAccount`, render current state via `AppHeader`/`AppFooter` (reused, matching every other page) + a new section.
- `app/settings/connections/actions.ts` — `"use server"`, `syncConnectedAccountsAction()`.
- `components/disala/google-connection-card.tsx` — `"use client"`, connect/reauthorize/disconnect UI using `useUser`/`useReverification`.
- `prisma/migrations/**` — new migration for the schema change below.

Modified:
- `prisma/schema.prisma` — `ConnectedAccount`: drop `accessToken`, `refreshToken`, `tokenExpiresAt`; add `providerEmail String?`.
- `components/disala/app-header.tsx` — add `UserButton.MenuItems`/`UserButton.Link` to "Connections".
- `.env.example` — add `CLERK_WEBHOOK_SIGNING_SECRET`.
- `proxy.ts` — add `/api/webhooks(.*)` to a public-route matcher so the webhook isn't blocked (only meaningful if reverification/middleware changes later; harmless no-op today given point 6 above, but correct either way).

## Functional requirements

- Signing up or signing in through Clerk results in a matching `users` row in Postgres within one webhook delivery (typically seconds), with `clerkId`, `email`, `name` populated; profile edits in Clerk propagate the same way; deleting the Clerk user deletes the local row (cascades to any dependent rows via existing `onDelete: Cascade`).
- Visiting `/settings/connections` while signed in but with no Google connection shows a single "Google" card explaining what connecting unlocks (Gmail search/read/draft/send, Calendar read/create/update/cancel + availability) and a "Connect Google" button.
- Clicking "Connect Google" completes Google's consent screen (scoped to the 4 scopes above) and returns to `/settings/connections` showing status "Connected" with the connected Google email address shown.
- If Clerk reports the connection needs reauthorization (revoked/expired on Google's side), the card shows a "Reconnect" action instead of "Connected".
- Clicking "Disconnect" removes the Clerk external account and updates the card back to the disconnected state; the corresponding `ConnectedAccount` row is marked `REVOKED`, not deleted.
- The Postgres `ConnectedAccount` row's `status`/`scopes`/`providerEmail` always reflect Clerk's live state after any of the above actions, verified by reading it back in the same request (Server Action re-fetches from Clerk and re-renders, doesn't trust client-side optimism).

## Security considerations

- No Google access or refresh token is ever stored in our database or sent to the browser — Clerk holds the only copy, consistent with `AGENTS.md` §16's "server-only secrets" list (this satisfies it more strongly than the original schema comment envisioned, by removing the token entirely from our surface area rather than encrypting it).
- `/settings/connections` and its Server Action both re-check `auth()`/`userId` server-side; nothing about which Google account is connected is inferred from client-supplied data.
- Webhook route verifies every request's signature via `verifyWebhook` (throws on bad signature → `400`); this is the only routes' authorization model, since Clerk-to-server webhook calls carry no user session.
- `ConnectedAccount` queries are always scoped by the internal `userId` resolved from the current session — never accept a `userId`/`connectedAccountId` from the client to decide whose row to touch.
- The 4 requested scopes are the minimum needed for the Gmail/Calendar capabilities `AGENTS.md` §9–10 describes; no broader `gmail.modify`, full `calendar`, or `mail.google.com` scope is requested.

## AI/agent behavior

Not applicable — no agent or tool-calling code in this prompt. (`getUserOauthAccessToken` is documented here because later phases depend on the decision made in this one, not because it's called anywhere yet.)

## Approval requirements

Not applicable — connecting/disconnecting your own Google account is a first-party account action you're taking directly, not an action Disala performs *for* you. `AGENTS.md` §7.3's approval requirement is about consequential actions Disala takes on your behalf (sending an email, creating a meeting); it doesn't apply to you managing your own integrations.

## Error handling

- `createExternalAccount`/`reauthorize`/`destroy` failures (rejected in Clerk's promise) are caught and shown as an inline error on the card — never silently ignored, never reported as if the action succeeded.
- Webhook handler returns `400` on signature verification failure (logged, not silently swallowed) and `200` on every successfully-processed event (per Svix's retry semantics — a `4xx`/`5xx` triggers retries, `2xx` doesn't).
- `getOrCreateInternalUser()` and `syncGoogleConnectedAccount()` surface Prisma errors rather than catching-and-ignoring them; the connections page shows a generic "couldn't load connection status" state rather than a blank/broken page if either throws.

## Acceptance criteria

- `npx prisma migrate dev` applies cleanly; `ConnectedAccount` no longer has token columns, has `providerEmail`.
- Signing up a brand-new test user creates a matching `users` row (verified via webhook delivery using `clerk webhooks listen` locally, and separately via the lazy `getOrCreateInternalUser` path by visiting `/settings/connections` immediately after signup, before the webhook could plausibly have fired).
- Editing the test user's name in Clerk's dashboard updates the local row.
- Deleting the test user in Clerk deletes the local row.
- Connecting Google end-to-end (real Google account, real consent screen) results in a `ConnectedAccount` row with `status = ACTIVE`, the 4 expected scopes, and the correct `providerEmail`.
- Disconnecting sets `status = REVOKED` and the Clerk external account is gone from `user.externalAccounts`.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.
- No Google access/refresh token appears anywhere in our database, logs, or network responses to the browser — spot-checked via `psql`/Table Editor and browser devtools during manual testing.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma validate`

## Manual test steps

1. `clerk webhooks listen --token "$(clerk webhooks token)" --forward-to http://localhost:3000/api/webhooks/clerk`, add the printed relay URL as a webhook endpoint in the Clerk Dashboard subscribed to `user.created`/`user.updated`/`user.deleted`.
2. Sign up as a new test user; confirm a `users` row appears in Supabase's Table Editor with the right `clerkId`/`email`.
3. Edit that user's name in the Clerk Dashboard; confirm the local row updates.
4. Visit `/settings/connections`; confirm the "Connect Google" card renders.
5. Click "Connect Google", complete Google's consent screen, confirm redirect back shows "Connected" with the correct Google email and that Postgres's `ConnectedAccount` row has `status = ACTIVE` and the 4 expected scopes.
6. Click "Disconnect"; confirm the card reverts and the row becomes `status = REVOKED`.
7. In Google's own "Third-party apps & services" account settings, revoke Disala's access directly (bypassing our disconnect button); reload `/settings/connections` and confirm it shows a "Reconnect" state, not a false "Connected".
8. Delete the test user in the Clerk Dashboard; confirm the local `users` row (and cascaded rows, if any exist) are gone.

---

## Manual setup required before I can implement/test this (not code — your call)

1. **Google Cloud Console**: create (or reuse) a project, enable the **Gmail API** and **Google Calendar API**, configure the OAuth consent screen, and create an **OAuth 2.0 Client ID (Web application)**. While the consent screen is in "Testing" status, add your own Google account as a test user — that's sufficient for development; you don't need Google's verification review yet since this isn't public.
2. **Clerk Dashboard → SSO Connections → Google**: switch from Clerk's shared/dev credentials to **your own custom credentials** (the Client ID/Secret from step 1) — required for Gmail/Calendar (sensitive) scopes to actually be grantable; the shared dev credentials can't request them.
3. **Clerk Dashboard → Webhooks**: create an endpoint (or use `clerk webhooks listen` locally per the test steps above) subscribed to `user.created`, `user.updated`, `user.deleted`; copy the signing secret into `.env.local` as `CLERK_WEBHOOK_SIGNING_SECRET`.
4. **Clerk Dashboard → Reverification** (optional but recommended): enable it so `useReverification` actually prompts for step-up auth before connecting/disconnecting Google.

I don't need your OpenAI key for anything in this prompt — that's Phase 4 (the AI agent). Please rotate it before then regardless, since it was pasted directly in chat.

Is this good to execute?
