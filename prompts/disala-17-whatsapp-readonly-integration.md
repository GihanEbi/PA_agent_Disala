# Disala — WhatsApp read-only integration (experimental, unofficial, opt-in)

## Goal

Let Disala answer questions like *"summarize my WhatsApp messages from today"* or *"what did Sarah say on WhatsApp?"* by reading the user's personal WhatsApp account — **read-only, never sending anything**. This phase ships:

1. A standalone background worker that links to a user's WhatsApp as a "companion device" (the same mechanism as WhatsApp Web/Desktop) and passively receives messages.
2. Encrypted, server-side storage of the resulting session credentials and a narrow, time-boxed, per-chat-opt-in cache of message metadata — the minimum needed to answer questions, not a mailbox export.
3. Two read-only agent tools (`search_whatsapp_messages`, `summarize_whatsapp_chat`) wired into the existing tool layer the same way Gmail/Calendar tools are.
4. A "Connect WhatsApp" flow (QR-code pairing, not OAuth) with an explicit one-time risk disclosure the user must accept before linking.

**This is flagged up front as a deliberate deviation from `AGENTS.md` §4** ("follow the provider's official API documentation," "do not create custom authentication... when an official provider flow is available"). There is no official API for reading a personal WhatsApp account. WhatsApp's only official surface (the Business Cloud API) covers messages sent to a business-owned number, not a personal inbox — it cannot do what's being asked here. Meeting the goal at all means using an unofficial, reverse-engineered client library that impersonates a linked device, which:

- **Violates WhatsApp's Terms of Service.** There is no way to do this compliantly.
- **Carries real, unpredictable ban risk** for the linked phone number. Public reports on unofficial WhatsApp clients (Baileys, whatsapp-web.js) describe bans within weeks for automation-heavy use; there's no reliable public data specifically isolating passive/read-only risk, and it should not be assumed to be zero.
- Is architecturally unlike every other integration in this codebase (see Architectural decision #1) — it needs an always-on background process, not a request/response API call.

Given that, this prompt treats WhatsApp as an **experimental, explicitly opt-in feature**, off by default, gated behind a real consent screen, not a peer of the Gmail/Calendar "just connect and go" experience. **Do not implement any of this without the user re-confirming acceptance of the ban risk for the specific phone number they intend to link** — that confirmation belongs in the approval-of-this-prompt step, not buried in a UI checkbox nobody reads.

Out of scope for this prompt:
- **Sending anything.** No `sendMessage`, no read receipts, no "mark as read," no typing indicators — the socket is used strictly to receive. This is permanent, not deferred to a later phase the way Gmail/Calendar's writes were in `disala-06`.
- **Group chats.** Only 1:1 personal chats the user explicitly opts into syncing are cached (see decision #5). Group chats often contain messages from people who never agreed to have their messages stored by a third-party tool; that's a privacy question this prompt doesn't try to resolve.
- **Media** (images, voice notes, documents, stickers) — text messages only. Media handling is real future work with its own storage/privacy questions.
- **Push notifications** for incoming WhatsApp messages ("Disala pings you when a WhatsApp arrives") — `AGENTS.md` §17 already scopes notifications as separate future work; this phase is query-on-demand only ("what did I miss on WhatsApp today" when asked, not proactive).
- **Multi-device nuance beyond the one companion-device link** (e.g. handling the user's own WhatsApp being simultaneously open on their phone and other linked devices) beyond what the library handles for us.
- Any UI polish beyond a functional connect/status/disconnect card and a simple per-chat opt-in list.

## Relevant skills

No packaged skill exists for WhatsApp/Baileys. Verified live this session (web search, since this isn't in training data as current fact and `AGENTS.md` requires following real provider behavior, not guessed API shapes):

- Library: [`@whiskeysockets/baileys`](https://www.npmjs.com/package/@whiskeysockets/baileys) (also published unscoped as `baileys`, same source, same version) — the actively maintained fork of the original Baileys project, under the WhiskeySockets org. Current stable line as of this session is the `6.7.x` series; `7.x` exists only as release candidates, so this phase pins to the latest `6.7.x`, not a `7.x` RC.
- Session persistence: Baileys' own `useMultiFileAuthState(folder)` helper is the standard pattern (`{ state, saveCreds } = await useMultiFileAuthState(folder); sock.ev.on('creds.update', saveCreds)`) — but it writes plaintext files to a local folder by default. This phase does **not** use it as-is (decision #3): the shape of what it persists (a `creds` object plus per-session `keys`) is real and needed, but this phase reimplements the storage side (`SignalKeyStore`/creds serialization) against an encrypted Postgres-backed store instead of a bare folder, because a bare folder of session files is exactly the kind of unencrypted-credential-at-rest `AGENTS.md` §16 forbids.
- Pairing: linking is QR-code based — the socket emits a `connection.update` event carrying a `qr` string (to be rendered as an image, e.g. via the `qrcode` npm package's `toDataURL`) until the user scans it from WhatsApp's own "Linked Devices" phone-side flow; a successful scan flips `connection.update` to `open`.
- Exact `makeWASocket()` config shape, the logger dependency (Baileys expects a `pino`-shaped logger passed in), and the precise `messages.upsert` event payload shape were **not** independently re-verified against Baileys' own README/source in this session beyond secondary sources — the assigned engineer must read `node_modules/@whiskeysockets/baileys`'s own README/type definitions before writing `lib/integrations/whatsapp/client.ts`, the same way `AGENTS.md`'s own header requires reading `node_modules/next/dist/docs/` before touching Next.js APIs. Do not guess event names or payload shapes from memory.
- Ban-risk framing above is drawn from public secondary sources (blog posts on Baileys/whatsapp-web.js ban patterns), not an official WhatsApp policy statement — treated here as a real, credible risk to disclose, not a precise statistic to quote to the user.

## Existing code inspected

- `lib/integrations/google-client.ts`, `lib/integrations/gmail.ts`, `lib/integrations/calendar.ts` — the existing integration-layer pattern: `Promise<GoogleApiResult<T>>` result envelope, Zod validation first, `userId` always the caller-resolved internal id, `import "server-only"` at the top of every file. This phase's `lib/integrations/whatsapp/queries.ts` follows the same envelope/validation/`userId` contract so the agent tool layer treats it uniformly with Gmail/Calendar — see decision #7.
- `lib/connected-accounts.ts` / `prisma.ConnectedAccount` — confirmed this model is Google-specific in practice (`provider: ConnectedAccountProvider` enum currently has only `GOOGLE`, and the whole model documents itself as "a synced read-model of Clerk's external account state"). WhatsApp has no Clerk-managed OAuth token to sync, so it gets its **own** model (`WhatsAppConnection`) rather than forcing `ConnectedAccount.provider` to grow a `WHATSAPP` value that would then need nullable Google-only fields to make sense for a non-OAuth provider — see decision #4.
- `lib/agent/tools.ts` — `buildAgentTools(userId, conversationId)`, one `tool({ description, inputSchema, execute })` per capability, closures capture `userId` so the model can never pass a different one. This phase adds two entries here, unchanged pattern.
- `prisma/schema.prisma` — no queue/job table, no cron, no webhook receiver besides Clerk's own. Confirmed (via repo-wide search) there is **no** background-job or long-lived-process pattern anywhere in this codebase today — every existing integration is synchronous request/response inside a Next.js route or Server Action. This phase is the first thing in the codebase that cannot fit that shape, which is why decision #1 exists.
- `package.json` — Next.js `16.3.4` App Router, Prisma `7.10.0` + `@prisma/adapter-pg` (Postgres), Clerk `^7.8.4`, `ai` SDK `^7.0.93`, Zod `^4.5.4`. No queue library (BullMQ/Inngest/etc.), no `pino`, no existing encryption utility of any kind — Google tokens never touch this database (Clerk holds them), so this phase is also the **first** thing in the codebase that needs to encrypt a credential at rest here.

## Architectural decisions

1. **The WhatsApp socket runs in a separate, standalone, always-on Node.js process — never inside a Next.js route handler or Server Action.** Every other integration in this app is a synchronous call-out made during a request; WhatsApp is fundamentally different because there is no "list my messages" REST endpoint to call on demand — Baileys works by opening a persistent WebSocket-like connection and receiving messages as events pushed in real time. A Next.js API route (especially on serverless hosting) has no way to keep that connection alive across requests. This phase therefore adds a new top-level `worker/` directory with its own entrypoint (`worker/whatsapp-worker.ts`, run via a new `npm run whatsapp:worker` script) that owns the Baileys socket, and the Next.js app never imports the socket-holding module directly — it only ever reads what the worker already wrote to Postgres. Deploying that worker as a real always-on process (a small VM/container, `pm2`, etc.) is a deployment/infra decision **out of scope** for this coding prompt; this prompt only makes it possible to run one locally (`npm run whatsapp:worker` in a second terminal during development).
2. **Message content IS cached in Postgres, as a deliberate, narrow, documented exception to `AGENTS.md` §8's "do not unnecessarily duplicate sensitive external content."** For Gmail/Calendar, caching would be unnecessary because both have real query APIs Disala can call live, on demand. WhatsApp has no equivalent for a user's own message history — the only way anything is ever known is if the always-on worker was connected when it arrived. Without a cache, "what did Sarah say yesterday" is unanswerable the moment the worker wasn't running at that exact second. This exception is bounded three ways to keep it honest: (a) only chats the user explicitly opts into syncing are stored at all (decision #5), (b) only a message's text and minimal envelope (sender, chat, timestamp) is stored — no media, no delivery/read receipts, (c) a retention window (default 30 days, configurable via `WHATSAPP_MESSAGE_RETENTION_DAYS`) is enforced by the worker deleting rows older than that on a timer, so this never grows into a permanent shadow archive of the user's WhatsApp history.
3. **Session credentials are encrypted at rest in Postgres, via a new `lib/crypto/encryption.ts` (AES-256-GCM, key from a new required env var `WHATSAPP_SESSION_ENCRYPTION_KEY`)** — the first credential-encryption utility this codebase has needed, because it's the first credential this codebase itself has to hold (Google's tokens are held by Clerk, never here). Baileys' own `useMultiFileAuthState` writes plaintext files to disk by default; this phase instead implements Baileys' `AuthenticationState` contract (`creds` + `keys` getter/setter/remove) backed by a `WhatsAppConnection.sessionState` `Json` column, encrypting the serialized blob before every write and decrypting on load. This is equivalent in sensitivity to an OAuth refresh token — full read access to the account — and is treated with the same "never log it, never return it to a client, never let the model see it" rule `AGENTS.md` §15/§16 states for OAuth tokens.
4. **A new `WhatsAppConnection` model, not a new value on `ConnectedAccount.provider`.** `ConnectedAccount` is documented in its own schema comment as "a synced read-model of Clerk's external account state" — every field on it (`providerAccountId`, `scopes`, Clerk-driven `status` transitions) assumes an OAuth-via-Clerk shape that doesn't apply here (there's no Clerk external-account sync, no scopes, and the credential itself — not just a read-model of it — has to live in our own database). Reusing that model would mean adding WhatsApp-only nullable columns to a model documented as Google-specific, or splitting its meaning inconsistently. A dedicated model keeps both honest.
5. **Per-chat opt-in, not "sync everything."** On first connecting, the worker fetches the user's chat list (Baileys exposes this) and the UI shows it so the user picks specific 1:1 chats to sync (decision: group chats excluded entirely from the picker, not just unchecked by default — see Goal's "out of scope"). Only messages from opted-in chats are ever written to `WhatsAppMessage`. This is `AGENTS.md` §13's "targeted retrieval, not the whole mailbox" principle applied to WhatsApp, and it also limits how much of *other people's* message content (the other side of a 1:1 chat, who never consented to Disala) gets stored — capped to specifically the conversations the user told Disala matter, not their entire social graph.
6. **Strictly read-only, permanently — not "deferred like Gmail's send was in `disala-06`."** `lib/integrations/whatsapp/` has no function that can send a message, mark one read, or otherwise touch the account beyond passively receiving. There is no `Approval`-gated "send WhatsApp message" path planned at all in this prompt — if that's ever wanted, it needs its own explicit prompt and its own explicit user sign-off, given it multiplies the ban-risk conversation (automated sending is the behavior most associated with detection/bans in the sources checked this session).
7. **Agent-facing read functions (`lib/integrations/whatsapp/queries.ts`) mirror the Gmail/Calendar contract**: `Promise<WhatsAppResult<T>>` = `{ok:true,data} | {ok:false,error:{code,message}}`, Zod-validated input, `userId` always caller-resolved — not because WhatsApp has the same failure modes (no OAuth token to expire, no Google quota) but because the agent tool layer (`lib/agent/tools.ts`) and any future UI treating tool results uniformly is worth more than a bespoke shape. Its own error codes: `NOT_CONNECTED` (no active `WhatsAppConnection`), `NO_SYNCED_CHATS` (connected but user hasn't opted any chat in), `INVALID_INPUT`.
8. **A one-time, explicit consent record**, not just a checkbox: `WhatsAppConnection.riskAcknowledgedAt` is set only after the connect UI shows the ban-risk disclosure in full and the user affirmatively accepts — the pairing flow (worker starts listening for a QR) does not begin until this timestamp is set. This is the product-level equivalent of this prompt's own opening section: the risk is disclosed once, clearly, in the place where the consequence actually lands (the phone number being linked), not just in this document.

## Assumptions

- **One WhatsApp account (one phone number) linked per Disala user**, matching how Google connections work today (one Google account per user in this app so far).
- **The worker runs as a single local/dev process during this phase**, holding sockets for however many users have connected — a real multi-tenant production deployment of this worker (process supervision, restart-on-crash, horizontal scaling if many users link accounts) is explicitly deferred; this phase's acceptance criteria are about correctness of the pairing/sync/query logic with one worker process, not production operability.
- **No historical backfill.** Connecting WhatsApp only starts capturing messages that arrive *after* a chat is opted in — Baileys' companion-device link does not hand over a user's pre-existing chat history (this mirrors how WhatsApp Web/Desktop itself behaves: history sync is a separate, more invasive feature this phase does not implement). This must be stated to the user in the connect UI so they don't expect "summarize what Sarah said last week" to work for a chat just opted in today.
- **Phone/contact identifiers, not names, are WhatsApp's ground truth** — a synced chat is keyed by its WhatsApp JID (e.g. `1234567890@s.whatsapp.net`), and a human-readable name (WhatsApp push name, or a name Disala already has via `Contact`/`ContactAlias` from `disala-14`) is resolved for display, not assumed reliable on its own.
- **No new environment beyond one new secret**: `WHATSAPP_SESSION_ENCRYPTION_KEY` (32-byte key, base64, generated once and stored like any other server secret — `.env.local`/deployment secret store, never committed).

## Files expected to change

New:
- `prisma/schema.prisma` additions: enum `WhatsAppConnectionStatus { PENDING_QR, CONNECTED, DISCONNECTED, ERROR }`; model `WhatsAppConnection { id, userId, phoneNumber String?, status, sessionState Json?, riskAcknowledgedAt DateTime?, connectedAt DateTime?, lastSeenAt DateTime?, createdAt, updatedAt }`; model `WhatsAppSyncedChat { id, userId, connectionId, chatJid String, chatName String?, syncing Boolean @default(true), createdAt }`; model `WhatsAppMessage { id, userId, chatJid, senderJid, senderName String?, text String, isFromMe Boolean, sentAt DateTime, createdAt }` with an index on `[userId, chatJid, sentAt]` for query performance and `[sentAt]` to support retention pruning.
- `lib/crypto/encryption.ts` — `encrypt(plaintext: string): string` / `decrypt(ciphertext: string): string` using AES-256-GCM and `WHATSAPP_SESSION_ENCRYPTION_KEY`; throws a clear startup-time error if the env var is missing or the wrong length, rather than silently storing plaintext.
- `lib/integrations/whatsapp/auth-store.ts` — implements Baileys' `AuthenticationState` contract backed by `WhatsAppConnection.sessionState`, encrypting/decrypting via `lib/crypto/encryption.ts`. Only ever imported by the worker.
- `lib/integrations/whatsapp/client.ts` — `startWhatsAppConnection(userId)` (worker-side only): creates the Baileys socket, wires `connection.update` (QR/open/close handling, writes `WhatsAppConnection.status`), wires `messages.upsert` (filters to opted-in `WhatsAppSyncedChat` rows, writes `WhatsAppMessage`). Only ever imported by the worker, never by anything under `app/`.
- `lib/integrations/whatsapp/queries.ts` — the agent/UI-facing surface, Postgres-only (never imports Baileys): `searchMessages(userId, {chatJid?, query?, after?, before?, maxResults?})`, `getRecentMessages(userId, {chatJid, limit?})`, `listSyncedChats(userId)`. Same `WhatsAppResult<T>` envelope as decision #7.
- `worker/whatsapp-worker.ts` — standalone process entrypoint: on boot, loads every `CONNECTED` `WhatsAppConnection` and re-establishes its socket; exposes a small internal control surface (see next bullet) for the Next.js app to request a new pairing session.
- `worker/whatsapp-control.ts` — a minimal local HTTP endpoint the worker listens on (e.g. `localhost:PORT`, not exposed publicly) that the Next.js API routes below call to say "start pairing for user X" / "give me the current QR" / "disconnect user X" — kept intentionally thin; this is internal process-to-process control, not a public API.
- `app/api/whatsapp/connect/route.ts` — `POST`: requires `riskAcknowledgedAt` to already be set (see below) or accepts the acknowledgment in the same request; tells the worker to start a pairing session for this user; returns the current QR (as a data URL) once available.
- `app/api/whatsapp/status/route.ts` — `GET`: returns the caller's `WhatsAppConnection.status` (for the connect UI to poll while waiting for a scan).
- `app/api/whatsapp/chats/route.ts` — `GET` lists the account's chats (1:1 only) available to opt into syncing; `POST` toggles `WhatsAppSyncedChat.syncing` for a given `chatJid`.
- `app/api/whatsapp/disconnect/route.ts` — `POST`: tells the worker to log out/destroy the socket for this user and sets `status: DISCONNECTED`; does **not** delete already-cached `WhatsAppMessage` rows (those still age out via retention) unless the user separately requests deletion.
- UI: a "WhatsApp" card alongside the existing Google connection card (wherever that's rendered — the connected-accounts settings surface from `disala-04`), showing the risk disclosure + consent checkbox before the first "Connect" click, then QR image + polling status, then a synced-chats picker once `CONNECTED`.

Modified:
- `lib/agent/tools.ts` — add `search_whatsapp_messages` and `summarize_whatsapp_chat` tools, same closure-captures-`userId` pattern as every existing tool; `summarize_whatsapp_chat` calls `getRecentMessages` and lets the model summarize the returned text (Disala does not fabricate a summary function of its own — the model does the summarizing, the tool only supplies real retrieved messages, per `AGENTS.md` §13/§15).
- `package.json` — add `@whiskeysockets/baileys` (pinned to latest `6.7.x`, not a `7.x` RC), `qrcode` (QR → data URL for the browser), `pino` (Baileys' expected logger shape — confirm exact requirement while reading its README per "Relevant skills" above), and a new `whatsapp:worker` script (`tsx worker/whatsapp-worker.ts` or equivalent — confirm the project's existing script-runner convention, currently plain `next`/`tsc`, before picking a runner).
- `.env.example` (if one exists) / documentation — add `WHATSAPP_SESSION_ENCRYPTION_KEY`.

Not touched: `lib/integrations/google-client.ts`, `lib/integrations/gmail.ts`, `lib/integrations/calendar.ts`, `lib/connected-accounts.ts`, `lib/approvals.ts` (no approval type needed — nothing here is ever consequential enough to approve, per decision #6).

## Functional requirements

- A user cannot start WhatsApp pairing without first acknowledging the risk disclosure (`riskAcknowledgedAt` set) — the connect UI shows this before any QR is requested.
- `POST /api/whatsapp/connect` starts (or resumes) a pairing session and the caller can retrieve a scannable QR code within a few seconds of the worker receiving the request.
- Once scanned and linked, `WhatsAppConnection.status` becomes `CONNECTED` and `phoneNumber`/`connectedAt` are populated from the socket's own connection info.
- `GET /api/whatsapp/chats` lists only 1:1 chats (group JIDs, which end in `@g.us`, are filtered out entirely, never shown as an option).
- Toggling a chat's `syncing` to `true` causes subsequently-arriving messages in that chat to be written to `WhatsAppMessage`; toggling it off stops new writes for that chat (existing rows are untouched, subject to retention).
- `search_whatsapp_messages({ chatJid?, query?, after?, before?, maxResults? })` returns matching cached messages (`{ chatJid, chatName, senderName, text, sentAt, isFromMe }[]`), newest first, capped at 50, scoped to the caller's own `userId` only.
- `summarize_whatsapp_chat({ chatJid, sinceHours? })` returns the raw recent messages for one chat (the model summarizes them in its response — the tool itself performs no summarization).
- A background pruning pass in the worker deletes `WhatsAppMessage` rows older than `WHATSAPP_MESSAGE_RETENTION_DAYS` (default 30) on a fixed interval (e.g. hourly `setInterval` inside the worker process — no new job-queue infrastructure needed for a once-an-hour delete).
- Disconnecting stops the socket and sets `status: DISCONNECTED`; reconnecting after a disconnect requires a fresh QR scan (no silent auto-relink from a stale session without the user's action) unless the stored session is still valid, in which case the worker resumes it on its own restart (matches the "worker loads every `CONNECTED` connection on boot" behavior above) — but an explicit user-initiated disconnect always requires a new scan next time, never a silent resume.

## Security considerations

- `sessionState` (the encrypted credential blob) is never returned by any API route, never logged, and never passed to the LLM — same rule as Google's access tokens, extended to this new credential type.
- The worker's control surface (`worker/whatsapp-control.ts`) binds to localhost only and is never exposed through a public route or reverse-proxied — it's a private process-to-process channel, not a feature.
- `WHATSAPP_SESSION_ENCRYPTION_KEY` absence or malformed value fails loudly at worker startup, not silently falling back to storing plaintext.
- Every query function enforces `userId` scoping at the database level (`WHERE userId = ...` on every `WhatsAppMessage`/`WhatsAppSyncedChat`/`WhatsAppConnection` read) — one user must never be able to read another's cached WhatsApp data, verified the same way `disala-14`'s contact-alias scoping was.
- Message text at rest is real personal content (the user's and their contacts') — this phase does not add field-level encryption for `WhatsAppMessage.text` beyond the database's own security (matching how `Note.content` and email bodies-in-transit are already handled elsewhere in this app), but retention pruning (decision #2) is the primary control limiting how much of it accumulates.
- The consent/disclosure text itself must not undersell the risk — it should state plainly that the linked number could be banned by WhatsApp with no advance warning and that this is an unofficial integration, not something Disala can prevent or appeal on the user's behalf.

## AI/agent behavior

- The two new tools slot into the existing `buildAgentTools` pattern with no changes to the chat loop, system prompt structure, or approval-decision logic elsewhere — from the model's point of view, `search_whatsapp_messages` behaves like `search_emails`.
- Per `AGENTS.md` §13, the agent should only reach for these tools when a request plausibly concerns WhatsApp specifically ("what did Sarah say on WhatsApp") — not fold WhatsApp content into every "what's important today" answer automatically, since most users won't have this connected. Achieved by the tool's own `description` string being specific ("the user's WhatsApp messages"), same mechanism every existing tool already uses to guide selection.
- If `search_whatsapp_messages`/`summarize_whatsapp_chat` return `{ok:false, error:{code:'NOT_CONNECTED'}}`, Disala should say plainly that WhatsApp isn't connected (or that no chats are synced yet) rather than implying it looked and found nothing — the same "known information vs. absence of a capability" distinction `AGENTS.md` §15 draws for every other integration.

## Approval requirements

None. Every function this phase adds is read-only (decision #6) — `AGENTS.md` §7.3's approval requirement applies to consequential/external actions, and nothing here performs one. If a future prompt ever adds WhatsApp sending, that prompt (not this one) defines its `ApprovalActionType` and payload shape.

## Error handling

- `WhatsAppResult<T>` mirrors `GoogleApiResult<T>`'s shape: `{ok:true,data} | {ok:false,error:{code,message}}`.
- `NOT_CONNECTED` — no `WhatsAppConnection` row, or its `status` isn't `CONNECTED`.
- `NO_SYNCED_CHATS` — connection is active but the user hasn't opted any chat into syncing yet (distinct from `NOT_CONNECTED` so the UI/agent can give the more specific "you're connected but haven't chosen any chats yet" guidance).
- `INVALID_INPUT` — Zod validation failure, same convention as Gmail/Calendar (first issue's path/message, never the raw Zod error).
- Worker-side failures (socket disconnects unexpectedly, WhatsApp logs the device out remotely, pairing times out) set `WhatsAppConnection.status` to `DISCONNECTED` or `ERROR` and are surfaced to the status-polling endpoint — never silently retried into an infinite reconnect loop without backoff, and never reported to the user as still-connected when the socket isn't.
- Nothing in this phase claims a chat is "synced and up to date" without the worker actually having an open, healthy connection at the time — if the worker itself isn't running at all, `status` should reflect `DISCONNECTED`/stale rather than the last-known-good state persisting indefinitely (e.g., a `lastSeenAt` heartbeat the status endpoint can compare against a staleness threshold).

## Acceptance criteria

- A test user can complete the full flow end-to-end: accept the risk disclosure → request pairing → scan the QR with a real personal WhatsApp account → see `status: CONNECTED` with the correct phone number.
- The chat list endpoint shows only 1:1 chats for that account, matching what WhatsApp's own app shows, with no group chats present.
- Opting a chat into syncing, then sending it a real message from the linked phone, results in a new `WhatsAppMessage` row within a few seconds — verified against the actual message text/sender/time.
- A chat **not** opted in produces no rows even after receiving new messages.
- `search_whatsapp_messages` and `summarize_whatsapp_chat`, called through the actual chat agent ("what did \[contact\] say on WhatsApp today"), return real synced content, not fabricated text.
- Disconnecting stops new messages from being written (verified by sending another message after disconnect and confirming no new row appears) and requires a fresh QR scan to reconnect.
- Retention pruning: a `WhatsAppMessage` row with `sentAt` manually backdated past the retention window is removed by the worker's next pruning pass.
- Attempting to read another user's `WhatsAppMessage`/`WhatsAppSyncedChat` data (two test users, one connected) fails/returns empty — verified directly against `queries.ts`, not just through the UI.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npx prisma validate`/`migrate` all pass.
- Grepping the repo for any Baileys send-capable call (`sendMessage`, `sendPresenceUpdate`, `readMessages`) used against a live socket finds zero call sites in `lib/` or `app/` — only inside comments explaining they're intentionally not used.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma validate` (and a real migration once the schema additions are finalized)

## Manual test steps

1. Set `WHATSAPP_SESSION_ENCRYPTION_KEY` locally; confirm the worker refuses to start without it.
2. Start the Next.js app and, separately, `npm run whatsapp:worker`.
3. As a real test user (use a spare/secondary WhatsApp-capable number, **not** a primary personal or business number, given the ban risk), go through the connect UI: confirm the risk disclosure appears and blocks proceeding until acknowledged.
4. Request pairing, scan the resulting QR from that phone's WhatsApp → Linked Devices, confirm `status` flips to `CONNECTED` and the phone number shown matches.
5. Open the chats picker, confirm only 1:1 chats appear (send yourself/a friend a message in a group first, from the linked phone, and confirm that group never appears as an option).
6. Opt one real 1:1 chat into syncing; from the linked phone (or the other side of that chat), send a distinctive test message; confirm a matching `WhatsAppMessage` row appears within a few seconds.
7. In Disala's chat, ask "what did \[that contact\] say on WhatsApp" and confirm the agent's answer reflects the real message sent in step 6, not an invented one.
8. Send a message in a **different**, non-opted-in chat; confirm no new row is written for it.
9. Disconnect via the UI; send another test message from the linked phone; confirm no new row appears; confirm reconnecting requires a fresh QR scan.
10. Manually backdate one `WhatsAppMessage.sentAt` in the database past the retention window; wait for (or manually trigger) the worker's pruning interval; confirm the row is deleted.
11. As a second test user with no WhatsApp connection, call `search_whatsapp_messages` through the agent; confirm a clear "WhatsApp isn't connected" response, not a crash or a false "no messages found."
12. Stop the worker process entirely (simulating it crashing); confirm the status endpoint reflects a stale/disconnected state rather than continuing to claim `CONNECTED` indefinitely.

---

Is this good to execute?
