# Disala — Learned name aliases + fuzzy contact/email matching

## Goal

Two related problems from real voice/chat use:

1. When Disala has to ask the user to clarify who a misheard or ambiguous name refers to, it forgets the answer immediately — the next time the user says that same name (even the same way), it asks again.
2. When the user gives a name or email address that doesn't *exactly* match a saved contact (a mishearing, a typo, a nickname), `search_contacts`/`search_notes` do plain substring matching, so a near-miss returns nothing — and the agent is instructed to say "I don't have that saved," which reads to the user as "you don't have that address," even when a close match exists.

**Framing note, called out explicitly because it affects what this phase actually builds:** "understand the user's accent" is not achievable by fine-tuning or adapting the Whisper transcription model here — that's a different, much larger undertaking (training data collection, model fine-tuning infrastructure) and not what the two examples in the request actually need. What the examples need — remembering a clarified name, and not falsely claiming an address doesn't exist — is solved at the application layer: a small persisted alias memory, and typo-tolerant matching over already-saved data. That's the scope of this phase. No changes to `/api/transcribe`, Whisper, or any speech model.

## Relevant skills

- `supabase-postgres-best-practices` — re-applied the same two findings `disala-13` used for `Contact`: an explicit `@@index` on every foreign key (Postgres doesn't auto-index them), and this repo's existing RLS convention (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with zero policies, defense-in-depth against the Supabase Data API — the app itself connects via a privileged role). The new `ContactAlias` table gets both from day one, via its own two migrations (schema, then RLS), exactly mirroring `20260906100544_add_contacts` + `20260906100625_enable_rls_contacts`.
- No packaged skill for fuzzy string matching — confirmed directly (see below) that no fuzzy/phonetic-matching library is an actual dependency of this project (`fuzzysort`/`levenshtein` packages only appear transitively in `package-lock.json`, pulled in by lint tooling, never imported by app code), so this phase writes a small, dependency-free Levenshtein-based helper rather than adding a package for one use site.

## Existing code inspected

- `components/disala/use-voice-recorder.ts`, `app/api/transcribe/route.ts`, `components/disala/voice-sheet.tsx` (`handleTranscribed`, lines ~156-167) — confirmed the full voice pipeline: `MediaRecorder` → one-shot upload → OpenAI Whisper (`whisper-1`) → `result.text.trim()` returned as-is, no post-processing, piped straight into `handleSend()` → `POST /api/chat`. Confirms there is no hook here to intercept "before the transcript reaches the agent," and that inserting one would mean guessing at corrections before the LLM even sees full conversational context — worse than letting the model ask and remember, which is the approach below.
- `app/api/chat/route.ts` (full file) — `generateText` agentic loop (`ai` SDK, `openai.chat("gpt-5.6-terra")`, `reasoningEffort: "none"`, `stopWhen: stepCountIs(8)`), tools from `buildAgentTools(userId, conversationId)`, last 20 messages as the only history, `PROPOSE_TOOL_NAMES` surfaced as `Approval` cards. Confirms: (a) one active conversation per user, so a resolved alias needs to persist independent of conversation/message history to actually help "next time," and (b) any new tool just needs to be added to the object `buildAgentTools` returns — no other wiring.
- `lib/agent/system-prompt.ts` (full file) — rebuilt fresh per request from `userName`/`timezone`/`now` only; already contains the exact line this phase must extend: `"...check search_contacts before asking the user or guessing. A miss only means you don't have their info saved — never say or imply the person doesn't exist."` (line 22). This is the one, prompt-only mechanism currently telling the model how to behave on a contacts miss — there's no structured "ask user to disambiguate" protocol, and no way today for the model to persist what the user answers.
- `lib/contacts.ts` (full file) — `searchContacts` (lines 104-117): a single `db.contact.findMany` with a four-field `OR`/`contains`/`insensitive` scan, no ranking, no typo tolerance. `createContact`/`updateContact`/`deleteContact` are all ownership-scoped (`where: { id, userId }` in `updateMany`/`deleteMany`), the pattern this phase's `ContactAlias` writes reuse.
- `lib/notes.ts` — `searchNotes` uses the identical `contains`/`insensitive` pattern over `title`/`content`. Confirmed there is no realistic way to "fuzzy-match" a whole free-text note body against a short query with an edit-distance approach — that's a different problem (semantic/full-text search) explicitly out of scope here (see Assumptions).
- `lib/agent/tools.ts` (full file) — the exact template for the new `save_contact_alias` tool is `create_note`/`create_contact` (direct execution, no approval, comment explaining why); `search_contacts`'s existing shape (`{ id, name, company, title, email, phone }[]`) is what this phase changes to `{ exact: [...], suggestions: [...] }`. Confirmed `searchContacts` and `search_contacts` (the tool) are only referenced from this one file plus `app/contacts/**` UI code (which calls `lib/contacts.ts` functions directly, not through the tool) — so widening the tool's return shape only affects the agent, not `/contacts` UI.
- `app/contacts/actions.ts`, `app/contacts/page.tsx` (full files) — confirmed the UI layer calls `createContact`/`updateContact`/`deleteContact`/(list) directly, never `searchContacts` — so this phase's changes to `searchContacts`'s return shape do not touch `/contacts` UI at all.
- `prisma/schema.prisma` (full file) — every model's conventions (`id String @id @default(cuid())`, `userId` + `user` relation as the first two fields, `@@map("snake_case_plural")`, `Contact` already has `@@index([userId])`). Confirmed `User.preferences Json?` (line 79) is defined but completely unread/unwritten anywhere in app code — considered and rejected as the home for this feature (see Architectural decisions #1).
- `prisma/migrations/20260906100544_add_contacts/migration.sql` and `prisma/migrations/20260906100625_enable_rls_contacts/migration.sql` — confirmed the exact two-migration pattern (schema change, then a separate one-line `ENABLE ROW LEVEL SECURITY`) this phase's `ContactAlias` table replicates.
- Grepped the whole repo for `fuzzy|levenshtein|similarity|alias|phonetic` — zero hits in app code, confirming there is genuinely nothing to build on and nothing to conflict with.

## Architectural decisions

1. **A new dedicated `ContactAlias` model, not the dormant `User.preferences Json?` column.** A JSON blob has no foreign key, no cascade-on-delete, no unique constraint, and no index — all four of which a per-contact alias needs (an alias must disappear if its contact is deleted, and a `(userId, alias)` pair must be unique so the *same* spoken name always resolves to exactly one contact). A relational table costs one small migration and gets all four for free; a JSON blob would need to reimplement them by hand in `lib/` code.
2. **Aliases point at a `Contact`, not a bare email string.** The request's own example ("ai agent clarify a email user that said... memorise it... don't ask the name again") is fundamentally "map a spoken/typed name to a specific saved person" — which this app already models as a `Contact`. If the user later edits that contact's email, the alias keeps working without any extra bookkeeping. Aliasing a bare, contact-less email address is a different, smaller feature (basically "remember this random string means this other string") that the request doesn't actually describe and isn't built here (see Assumptions).
3. **Alias text is normalized (trimmed + lowercased) before it's written or looked up**, and `(userId, alias)` is the unique key. This avoids needing Postgres `citext`/a case-insensitive collation just for this one column, and matches how the rest of this app already does case-insensitive matching (`mode: "insensitive"` on `contains` calls) without a schema-level solution.
4. **`searchContacts`'s return shape changes from `Contact[]` to `{ exact: Contact[]; suggestions: { contact: Contact; score: number }[] }`.** `exact` covers both the existing `contains` scan and a direct alias hit (an alias match is placed first and de-duplicated against any `contains` hits). `suggestions` is populated **only when `exact` is empty** — a small, dependency-free Levenshtein-similarity scan (see #6) of the user's contacts' `name`/`email` against the query, filtered to score ≥ 0.55, capped at 3, sorted descending. This is the one function every "don't say it doesn't exist" behavior in this phase routes through. Confirmed `searchContacts` has exactly one caller (`lib/agent/tools.ts`'s `search_contacts` tool), so this is a contained, non-breaking change.
5. **A new `save_contact_alias` agent tool, executed immediately with no approval** — same bucket as `create_note`/`create_contact` (`disala-07`/`disala-13`'s own precedent: the user's own first-party data, no external effect, trivially reversible by saving a corrected alias later). It takes `{ contactId, alias }`, verifies the contact belongs to the calling user (returns an honest `{ ok: false, error }` rather than throwing if not, e.g. the contact was deleted mid-conversation), and upserts on `(userId, alias)` — a second call with the same alias text pointed at a different contact overwrites the mapping, which is correct: it means the user corrected an earlier, wrong resolution.
6. **Fuzzy matching is a small, self-written Levenshtein-distance helper (`lib/fuzzy-match.ts`), not a new dependency.** Confirmed (Relevant skills) nothing fuzzy is already installed; a normalized edit-distance similarity score (`1 - distance / max(len_a, len_b)`) is enough to catch the concrete cases in the request — a misheard/mistyped name ("Jehaan" vs "Jehan") and a typo'd email domain ("gmial.com" vs "gmail.com") — without pulling in a phonetic-matching library (Soundex/Metaphone) that solves a broader problem than what was asked.
7. **No fuzzy enhancement to `searchNotes`.** Edit-distance similarity is well-defined for two short strings (a name, an email); it isn't a meaningful way to fuzzy-match a short query against an entire free-text note body. `search_notes`'s existing `contains` scan is left exactly as it is, and the "go through notes" half of the request is satisfied by the agent's own orchestration (see #9) using the existing tool as-is, not by a data-layer change here.
8. **No new `verify_email`/`check_email_similarity` tool.** The typo-checking behavior ("if user gives an email, check contacts/notes/emails for something similar before saying it's not there") is built by (a) `search_contacts` now returning fuzzy suggestions against saved contacts' email fields, and (b) a system-prompt instruction telling the agent to also use the **existing** `search_notes`/`search_emails` tools it already has when a given address doesn't match anything exactly — composing existing read tools rather than adding a bespoke one, matching this codebase's stated tool-layer philosophy ("the agent combines information from multiple services") and keeping the tool surface from growing for a case the model can already handle by calling tools it has twice instead of once.
9. **This is advisory, not a hard gate.** `propose_email`'s `to` field keeps its existing `.email()` validation and is otherwise completely unchanged — a genuinely new, correct email address must still go through unmodified. The fuzzy-suggestion behavior only shapes what the agent says and asks *before* it gets there; it never blocks or silently rewrites an address the tool layer would otherwise accept.
10. **`ContactAlias` gets `@@index([userId])`, `@@index([contactId])`, and RLS enabled with zero policies**, via two migrations mirroring `disala-13`'s `add_contacts` + `enable_rls_contacts` pair exactly.
11. **No new UI.** There is no reference design for an "aliases" list, and AGENTS.md's UI rule is explicit that new UI needs a provided reference image, not an invented one. Aliases are entirely agent/conversation-managed in this phase (create via `save_contact_alias`, implicitly superseded by saving a new one for the same text). A visible "known as" list on the contact edit page is a reasonable, separate follow-up once there's a reference for it — not built here.

## Assumptions

- **No literal ASR/accent adaptation.** Confirmed and explained under Goal — Whisper, `/api/transcribe`, and the voice pipeline are untouched.
- **Aliases are contact-scoped, not free-floating email aliases.** "Remember this exact email string means that exact other email string" (with no `Contact` involved) is not built — the natural path for that is the user saving the address as a `Contact` (already supported), which then benefits from everything in this phase.
- **No fuzzy matching against Gmail message content.** `search_emails` is unchanged; the agent is only told (in the system prompt) to use it as one more source of "have I seen something like this address before" for a given request, the same way it already decides when to call it. No new ranking/matching logic is added inside the Gmail integration itself.
- **Fuzzy suggestion thresholds (`0.55` similarity floor, top 3) are a first-pass tuning choice**, called out as adjustable constants (`FUZZY_MATCH_THRESHOLD`, `FUZZY_MATCH_LIMIT`) in `lib/fuzzy-match.ts` rather than hard-coded inline, so they're easy to revisit after real use.
- **A real schema migration is required** (two, matching the contacts precedent) — flagged clearly, run via `npx prisma migrate dev`, same caution as every prior phase that touched the schema.

## Files expected to change

New:
- `prisma/migrations/<timestamp>_add_contact_aliases/migration.sql` — generated by `prisma migrate dev`, not hand-written.
- `prisma/migrations/<timestamp>_enable_rls_contact_aliases/migration.sql` — generated, one-line `ALTER TABLE "contact_aliases" ENABLE ROW LEVEL SECURITY;`, mirroring `20260906100625_enable_rls_contacts`.
- `lib/fuzzy-match.ts` — `levenshteinDistance`, `similarity`, `findFuzzyMatches` (generic helper: query, candidate list, a text-extractor, threshold, limit).
- `lib/contact-aliases.ts` — `saveContactAlias({ userId, contactId, alias })` (ownership-checked upsert), `findContactByAlias({ userId, alias })`.

Modified:
- `prisma/schema.prisma` — add `ContactAlias` model; add `aliases ContactAlias[]` to `User` and `Contact`.
- `lib/contacts.ts` — `searchContacts` gains the alias lookup + fuzzy fallback, returns `{ exact, suggestions }` instead of `Contact[]`.
- `lib/agent/tools.ts` — update `search_contacts`'s `execute`/description for the new return shape; add `save_contact_alias` tool (13 → 14 tools total).
- `lib/agent/system-prompt.ts` — extend the existing contacts-miss guidance to cover suggestions, add guidance for checking a given email against contacts/notes/emails before treating it as unknown, and add the "remember the resolution" instruction.

Not touched: everything under `components/disala/voice-sheet*.tsx`, `use-voice-recorder.ts`, `app/api/transcribe/**`, `app/api/speak/**` (no ASR/TTS changes), `app/contacts/**` UI, `lib/notes.ts`, `app/notes/**`, `lib/integrations/gmail*`, `lib/integrations/calendar.ts`, `app/mail/**`, `app/calendar/**`, `lib/approvals.ts`, `app/api/chat/route.ts` (only its already-dynamic `buildAgentTools`/`buildSystemPrompt` outputs change, not the route itself), any existing migration.

## Functional requirements

- Asking Disala about a name that doesn't exactly match any saved contact, but is close to one (misspelling, mishearing, partial name), gets a response that offers the close match(es) by name — never a flat "I don't have that."
- If exactly one contact was previously confirmed for a given alias (via `save_contact_alias`), a later request using that same alias text resolves directly, with no clarifying question, even if the alias text itself would never have matched the contact's real name/email via plain substring search.
- After the agent asks the user to disambiguate an unclear name and the user answers, the agent calls `save_contact_alias` for that resolution before finishing its reply — the user does not have to explicitly say "remember that."
- Giving Disala an email address to use in an action (e.g., "send it to john@gmial.com") that closely resembles a saved contact's real address triggers a check against contacts (and, per the system prompt, notes/emails) and a flagged discrepancy ("that looks close to John's saved address, john@gmail.com — did you mean that one?") instead of silently proceeding or silently failing.
- None of this changes what happens once an action is actually proposed — `propose_email`/`propose_meeting`/etc. and their approval cards are functionally identical to today.

## Security considerations

- `ContactAlias` rows are always written/read scoped by `userId` derived server-side (the tool closure already captures `userId`; `saveContactAlias`/`findContactByAlias` both take it as a required parameter and put it directly in the `where` clause) — identical to every other user-owned model in this codebase.
- `saveContactAlias` re-verifies the target `contactId` belongs to the calling `userId` before writing (`db.contact.findFirst({ where: { id: contactId, userId } })`) — the model cannot use this tool to attach an alias to another user's contact even if it somehow produced a foreign id.
- `ContactAlias` gets RLS enabled (zero policies, matching the existing defense-in-depth convention) and indexes on both foreign keys.
- The `save_contact_alias` tool's `inputSchema` carries no `userId` — same non-negotiable property every existing tool already has.
- Alias text renders nowhere in the UI in this phase (no new UI), so there's no new XSS surface; it only ever flows back into the system prompt/tool results as plain data for the model.

## AI/agent behavior

- `search_contacts({ query })` — now returns `{ exact: [...], suggestions: [...] }`, each entry the same minimal safe shape as today (`id, name, company, title, email, phone`), `suggestions` additionally carrying a `score`. Checks a learned alias first, then the existing substring scan, then (only if both are empty) fuzzy suggestions.
- `save_contact_alias({ contactId, alias })` — no approval, executes immediately, matching `create_note`/`create_contact`'s existing treatment and justification.
- System prompt additions (extending, not replacing, the existing lines):
  - `search_contacts` may return `suggestions` instead of an exact hit — these are close-but-unconfirmed matches, never presented as certain. If there's exactly one, propose it and ask for confirmation. If there's more than one, list the candidates and ask which one (or none) — never pick for the user.
  - Once the user confirms which contact an ambiguous or misheard name refers to, call `save_contact_alias` with that contact's id and the exact text the user used, so the same name resolves directly next time.
  - A `search_contacts` miss (no exact match and no suggestions) still only means nothing saved looks like it — never imply the person or address doesn't exist.
  - When the user supplies a specific email address to use in an action and it doesn't exactly match a saved contact, check `search_contacts` (and, if relevant, `search_notes`/`search_emails`) for anything similar before proceeding; a close match is more likely to be a small mistake than a new address, so surface it and ask rather than silently using either one.

## Approval requirements

Not applicable, same category as `create_note`/`create_contact` (`AGENTS.md` §7.3): `save_contact_alias` only records the user's own already-stated preference about their own already-saved contact, with no external effect. No new `ApprovalActionType`. Anything that later *uses* a resolved contact to affect something external (`propose_email`, `propose_meeting`, etc.) is completely unchanged and still goes through its existing approval gate.

## Error handling

- `saveContactAlias` returns `{ ok: false, error: "Contact not found" }` rather than throwing when the given `contactId` doesn't belong to the calling user (e.g., deleted mid-conversation) — the tool surfaces this so the agent can say so honestly instead of silently no-op'ing or crashing the turn.
- `searchContacts`/`findContactByAlias` never throw for "nothing found" — an empty `exact`/`suggestions` pair is a normal, valid result.
- Deleting a `Contact` cascades and deletes its `ContactAlias` rows (`onDelete: Cascade`) — no orphaned aliases pointing at a deleted contact.
- A duplicate `save_contact_alias` call for the same `(userId, alias)` overwrites the previous mapping (upsert) rather than erroring — a user correcting an earlier wrong resolution is the expected case, not a failure.

## Acceptance criteria

- A misspelled or misheard name that's close to exactly one saved contact produces a "did you mean X" style response, not a false "don't have that."
- Confirming that suggestion causes a `contact_aliases` row to be created (verifiable directly in Postgres), and a later message using that same alias text resolves the contact directly with no clarifying question in that turn.
- A typo'd email address close to a saved contact's real address is flagged as a possible match rather than silently accepted or silently rejected.
- Deleting a contact removes its aliases (`contact_aliases` has no dangling rows for it, verified in Postgres).
- A second test user's aliases are never visible to or resolvable by the first (RLS + `userId` scoping, verified with two accounts).
- `propose_email`, `propose_meeting`, `create_contact`, and all existing exact-match `search_contacts` behavior are unchanged for cases that already worked.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npx prisma validate` all pass.
- Grepping the diff confirms zero changes under every path listed in "Not touched" above.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma validate`
- `npx prisma migrate dev` (creates and applies the two new migrations locally)

## Manual test steps

1. `npx prisma migrate dev`, then `npm run dev`. Create a contact, e.g. "Jehan Perera", `jehan@x.com`.
2. In chat, ask Disala to do something involving a **misspelled** version of that name it hasn't seen before (e.g. "send a message to Jehaan about lunch"). Confirm the reply offers "Jehan Perera" as a likely match and asks for confirmation, rather than saying it doesn't have that contact.
3. Confirm ("yes, that's him"). Check Postgres: a `contact_aliases` row exists for that user with the misspelled text pointing at the contact's id.
4. Send a fresh message later using the exact same misspelled name (e.g. "email jehaan about the report"). Confirm Disala resolves it immediately with no clarifying question this time.
5. Ask Disala to email an address that's a one-character typo of the saved contact's real address (e.g. `jehan@xx.com` vs `jehan@x.com`). Confirm it points out the close match and asks which is correct, rather than proceeding silently or claiming the address is unknown.
6. Confirm existing exact-match behavior is unchanged: searching/using a contact by its correct name/email still works exactly as before, and `propose_email`/`propose_meeting` approval cards look identical to before this phase.
7. Delete the test contact; confirm its `contact_aliases` row is gone from Postgres.
8. Sign in as a second test user; confirm they have no access to the first user's aliases (attempt via a similarly-misspelled name — it should not resolve, and Postgres shows no cross-user rows).
9. Run `npx prisma validate`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — confirm all pass.
10. Confirm `/mail`, `/calendar`, `/notes`, `/contacts`, and the voice/chat flows are visually and functionally unchanged (regression check — this phase touches no UI and no ASR/TTS code).

---

## Manual setup required before I can implement/test this

None new — no new environment variable, no new dependency, `OPENAI_API_KEY`/`DATABASE_URL` already configured. Same note as `disala-13`: this phase runs a real `npx prisma migrate dev` (two migrations) against your database — say the word if you'd like to review the generated SQL before it's applied, otherwise I'll run it as part of implementation.

Is this good to execute?
