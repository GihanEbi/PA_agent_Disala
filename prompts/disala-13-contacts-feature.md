# Disala — Contacts: scan a business card, review, save, and give the agent access

## Goal

A new first-party data type, **Contact**, alongside Notes: the user can (a) scan a business-card photo, have Disala extract structured fields via an OpenAI vision call, review/edit them, and save; or (b) add a contact manually by typing. Saved contacts are the user's own data — like Notes, not an external/consequential action — so per your choice this is a **lightweight review-and-edit-then-save flow, not a formal `Approval`**. The chat agent gets read (and, per decision #9, write) access to Contacts so it can resolve "email Sarah from Acme" to a real address while doing other tasks.

## Relevant skills

- `supabase-postgres-best-practices` — consulted before designing the migration. Two concrete findings applied directly:
  - `schema-foreign-key-indexes` (CRITICAL): Postgres never auto-indexes a foreign key. **Checked the existing schema and confirmed no model in this codebase has an explicit `@@index([userId])` today** — a pre-existing, repo-wide gap (not introduced by this phase, not fixed for existing tables here, but avoided for the new one: `Contact` gets `@@index([userId])` from day one).
  - `security-rls-basics` (CRITICAL): this codebase already has a working RLS convention — `prisma/migrations/20260905184258_enable_rls/migration.sql` enables RLS with **zero policies** on every table that existed at the time, specifically as defense-in-depth against the Supabase Data API ever being turned on (the app itself connects via a privileged, RLS-bypassing role; authorization is enforced in application code). **Checked and confirmed `notes` never got this** — it was created in a later migration and nobody re-enabled RLS for it, a pre-existing gap this phase does not fix (out of scope — fixing it means touching `notes`, which you asked not to touch, and Gmail/mail files were the explicit no-touch instruction previously; `notes` wasn't mentioned then, but expanding this phase to "also fix Notes' RLS" is a separate, unrelated cleanup). `contacts` gets the same zero-policy `ENABLE ROW LEVEL SECURITY` treatment from day one, matching the pattern correctly rather than repeating the gap.
- No packaged skill for OpenAI's vision/structured-output API — confirmed directly against the installed SDK types (below) rather than assumed, matching the discipline every prior integration phase in this project applied to a new provider surface.

## Existing code inspected

- `prisma/schema.prisma` (full file) — every model's exact shape and conventions: `id String @id @default(cuid())`; `userId` + `user User @relation(..., onDelete: Cascade)` as the first two fields after `id`; optional scalars as `String?`; `createdAt`/`updatedAt` only on editable models (`Note` has both; `Reminder`/`Suggestion` have only `createdAt`); `@@map("snake_case_plural")` on every model; enums for closed sets of values (`CreationSource` reused across `Note`/`Reminder`). `User` carries the inverse relation array for every child model (`notes Note[]` at line 83) — `Contact` needs the same.
- `prisma/migrations/` — five migrations, timestamp-prefixed (`YYYYMMDDHHMMSS_description`), newest `20260905203022_approval_result`. `20260905184258_enable_rls/migration.sql` (full file) — the RLS pattern above.
- `lib/notes.ts` (full file) — the exact CRUD pattern `lib/contacts.ts` replicates: `import "server-only"`; plain TypeScript parameter objects, **no Zod inside this file** (validation happens one layer up, in the Server Action); every function takes `userId` explicitly and puts it straight in the `where` clause; `deleteNote` returns a `boolean` (`deleteMany(...).count > 0`) instead of throwing, so "not found" and "not yours" are indistinguishable by design (same reasoning applies to `deleteContact`); `searchNotes` does a case-insensitive `contains` OR-scan across two text fields with a comment noting there's no full-text index — `searchContacts` does the same across `name`/`company`/`email`/`phone`.
- `app/notes/actions.ts` (full file) — the Server Action pattern `app/contacts/actions.ts` replicates exactly: `"use server"`; every action independently re-derives `auth()` → `getOrCreateInternalUser()` (never trusts a client-supplied user id); trims/validates input in the action, not the data-layer function; calls the `lib/*.ts` function with `userId: internalUser.id`; ends with `revalidatePath(CONTACTS_PATH)`.
- `lib/agent/tools.ts` (full file) — `search_notes` (`inputSchema: z.object({ query: z.string() })`, maps rows to a minimal safe shape before returning) and `create_note` (direct create, explicit comment justifying no-approval-needed) are the two templates `search_contacts`/`create_contact` copy. `buildAgentTools(userId, conversationId)` closes over `userId` so neither new tool's `inputSchema` includes it — the same non-negotiable property every existing tool already has.
- `components/disala/note-composer.tsx`, `note-row.tsx`, `note-card.tsx`, `capture-note-button.tsx` (all full files) — the four component patterns this phase's `ContactComposer`/`ContactRow`/`ContactCard`/`CaptureContactButton` mirror structurally (local `useState`/`useTransition`, ad hoc `<p className="text-red-400">` error display, hover-revealed delete with `window.confirm`, a dashed-border button opening a global sheet via a Context provider).
- `components/disala/voice-sheet-context.tsx` / `voice-sheet.tsx` (full files) — the established idiom for "a button opens a full-screen bottom sheet flow mounted once at the root": a Context provider rendering one `<Sheet open onClose>` singleton, `app/layout.tsx:33` mounting `VoiceSheetProvider` around `{children}`. This phase adds a second, independent provider (`ScanCardSheetProvider`) the same way — not a new mode bolted onto `VoiceSheet`, since photo-capture-and-form-review is a fundamentally different interaction from voice/chat and `VoiceSheet` is already handling three concerns (voice, chat, TTS playback) after `disala-10`/`disala-11`.
- `components/disala/app-header.tsx` — `<UserButton.MenuItems>` currently has exactly two `<UserButton.Link>` entries (Connections, Approvals; `components/disala/app-header.tsx:51-62`). A third, `Contacts → /contacts`, is a two-line addition to the same block, matching the exact pattern.
- `components/disala/bottom-nav.tsx` and `disala-08`'s decision #8 (re-read in full) — **Contacts is reached via the `UserButton` menu, not a fifth bottom-nav tab**, for the identical reasons already argued and settled there: the 4-item nav is a reproduced reference design with no reference for a 5th item, and adding one is a visual redesign this project's process forbids without one. Not re-litigated here — the precedent is directly reused.
- `components/ui/` inventory — only `button.tsx`, `input.tsx`, `select.tsx`, `badge.tsx` exist. **No `Textarea` primitive.** `note-composer.tsx` uses a raw, inline-styled `<textarea>` rather than inventing one. This phase's one multi-line field (a contact's address) follows that exact precedent rather than adding a new `components/ui/textarea.tsx` for a single use site.
- Grepped `app/` and `components/` for `type="file"`, `accept=`, `capture=` — **zero matches**. There is no existing file-upload or camera-capture precedent anywhere in this repo; the business-card photo input is new UI, built from a plain hidden `<input type="file" accept="image/*" capture="environment">`, no new dependency.
- `app/api/transcribe/route.ts` (from `disala-10`, full file) — the direct precedent for this phase's new route: `auth()` → 401, parse `multipart/form-data`, validate the file's presence/size, call the AI SDK function, map failure to an honest JSON error with a non-200 status, and — the property being replicated most deliberately — **never persist the uploaded media**. `app/api/contacts/extract/route.ts` follows this exactly for the card photo.
- `node_modules/ai/dist/index.d.ts:7605` (`generateObject`) and `node_modules/@ai-sdk/provider-utils/src/types/content-part.ts:62-102` (`FilePart`) — confirmed directly against the installed SDK the current (non-deprecated) way to send an image in a prompt: a user message whose `content` is an array including `{ type: "file", data: <Uint8Array | base64 string>, mediaType: "image/jpeg" }` alongside a `{ type: "text", text: "..." }` instruction part, then `generateObject({ model, schema, messages })` for structured output.
- `node_modules/@ai-sdk/openai/dist/index.d.ts` (`OpenAIChatModelId`) — confirmed the installed SDK's model catalog includes both `gpt-5.6-terra` (already used by `app/api/chat/route.ts`, whose vision support is unverified from here) and `gpt-4o` (OpenAI's long-established multimodal/vision baseline). Decision #2 below explains the choice.
- `app/layout.tsx` (full file) — confirmed the exact mount point (`app/layout.tsx:33`, `<VoiceSheetProvider>{children}</VoiceSheetProvider>`) where `ScanCardSheetProvider` is added alongside it.

## Architectural decisions

1. **New `Contact` model, new `ContactSource` enum (`MANUAL` | `BUSINESS_CARD`)** — a distinct enum from the existing `CreationSource` (`USER`/`ASSISTANT`), because they answer different questions: `CreationSource` says *who* created a row (person vs. the AI), `ContactSource` says *how* this one was captured (typed vs. scanned). Conflating them would make a voice-dictated manual contact indistinguishable from a card scan.
2. **Vision extraction uses `gpt-4o`, not the chat route's `gpt-5.6-terra`**, as a named constant (`CARD_VISION_MODEL_ID`) — one line to change later. `gpt-4o` has long-established, well-documented multimodal/vision support; `gpt-5.6-terra`'s vision capability is unverified from this session's available references (it's a model released after this assistant's own knowledge cutoff). This will be confirmed live with a real test photo during implementation (the same discipline `disala-06` applied to Google's REST endpoints) rather than assumed either way, and swapped if the live test says otherwise.
3. **The extracted-fields schema is loose, not strict, on purpose.** Every field (`name`, `company`, `title`, `email`, `phone`, `website`, `address`) is an **optional plain string** in the vision-extraction Zod schema — no `.email()`/phone-format validation at extraction, at the manual-composer Server Action, or in `lib/contacts.ts` itself. A business card's OCR'd text won't always parse as a strict email/phone, and a `Contact` row is reference data the user might deliberately want to save "as printed" and fix later — strict format validation belongs at the one place it actually matters (sending an email), which `propose_email`'s existing `.email()` check on the `to` field already enforces at send time, unchanged by this phase. The one required field is `name` (both in the Prisma schema and as a client-side Save-button gate), because an unnamed contact isn't useful to search for later.
4. **No image is ever persisted.** The uploaded card photo lives in memory for the duration of the single `/api/contacts/extract` request and is discarded once the response is sent — identical to `disala-10`'s treatment of uploaded audio. No new file storage, no new database column for an image, no new dependency for image handling.
5. **The review-and-edit step is client-side state, not a database row, until "Save Contact" is tapped.** Extraction returns fields to the browser; nothing is written to `contacts` until the user explicitly confirms (and can edit any field first). This is the literal shape of "review before save" from your answer, distinct from a formal `Approval` (no `Approval` row, no `/approvals` page involvement, no `ApprovalActionType` change).
6. **`ScanCardSheetProvider`/`ScanCardSheet` is a new, independent global sheet — not a third mode on `VoiceSheet`.** `VoiceSheet` already juggles voice/chat/TTS-playback state after `disala-10`/`disala-11`; bolting photo-capture-and-form-review onto it as a fourth concern would make an already-dense component harder to reason about for no shared benefit (the two flows share no state). Mounted the same way (`app/layout.tsx`), reached the same way (a dedicated button calls `openSheet()` from a `useScanCardSheet()` hook).
7. **The sheet has four states — capture, extracting, review, error** — built entirely from existing primitives (`Button`, `Input`, `VoiceStateChip` reused verbatim for the "Reading card…" loading state, a raw `<textarea>` for the one multi-line field) since there is no reference image for this new surface, matching how `disala-08`'s cancel-card treatment was built "from existing primitives only" for the same reason.
   - **Capture**: one large button ("Take or choose a photo") opening the hidden file input.
   - **Extracting**: `<VoiceStateChip label="Reading card…" />` while the upload/vision call is in flight.
   - **Review**: editable fields pre-filled from the extraction (`Input` for name/company/title/email/phone/website, a small `<textarea>` for address), a "Save Contact" button (disabled until `name` is non-empty), a "Retake" button (discards the extraction, returns to Capture), and the sheet's usual close (X/backdrop/Escape) which discards everything.
   - **Error**: a plain honest message ("Couldn't read that card — try again" or a permission/size-specific message) with a "Try again" action back to Capture. Never fabricates fields on a failed extraction.
8. **The page-level "quick add" (`ContactComposer`) is intentionally smaller than the scan review form** — four fields (name, company, email, phone), mirroring `NoteComposer`'s minimalism rather than exposing every possible field in the fast path. Title/website/address remain settable via the scan flow (which naturally has them from OCR) for this phase; a "full edit" form for an already-saved contact is explicitly out of scope (decision #12).
9. **The agent gets both `search_contacts` (read) and `create_contact` (direct write, no approval)** — read access is the core of your request ("AI agent can access to that data... when doing same task"); write access is added by direct analogy to `create_note` (`disala-07`'s own precedent: the user's own first-party data, no external effect, no approval needed) so a user can also say "add John, 0771234567, as a contact" in conversation, not only through the scan/manual-form UI. `create_contact`'s `email` field, unlike everywhere else in this phase, **is** validated with `.email().optional()` at the tool boundary — the one place data could plausibly arrive from a model's own (occasionally imperfect) formatting rather than a human typing or a card's printed text, so a stricter gate there is reasonable defense without touching the looser rule everywhere else (decision #3).
10. **`Contact` gets `@@index([userId])` and RLS enabled with zero policies**, per the two skill findings above — done correctly for the new table without attempting to retroactively fix the same gaps on `notes`/`approvals`/etc., which is unrelated cleanup outside this feature's scope.
11. **Reachable via the `UserButton` menu (`/contacts`), not a new bottom-nav tab** — direct reuse of `disala-08` decision #8's settled reasoning, not re-argued.
12. **No edit or delete-and-recreate flow for an already-saved contact — only create (scan or manual) and delete.** Matches this phase's actual ask; editing a saved contact's details is a real, separate follow-up (the same category of exclusion `disala-09` applied to a Mail detail view), not silently dropped.

## Assumptions

- **No duplicate detection.** Scanning the same card twice, or an email that already exists on another contact, creates a second row; the user deletes an unwanted duplicate manually (mirrors how this app has never built de-dup for notes either). A future phase could add an email-match warning before Save.
- **`notes`'s missing RLS (found during this phase's own investigation) is a known, pre-existing gap this phase does not fix.**
- **No file-size cap in bytes is documented for OpenAI's vision input beyond generous practical limits** — this phase enforces its own **15 MB** cap server-side as a sanity bound (well above any real phone-camera JPEG, well below `disala-10`'s 25 MB audio cap), not because a provider limit was found and matched.
- **Client-side image compression is not performed.** A typical phone-camera JPEG (a few MB) uploads as-is; if this proves slow in practice, client-side downscaling before upload is a contained follow-up, not built here (no new dependency needed for a first pass).
- **No new environment variable, no new top-level dependency.** `OPENAI_API_KEY` (already configured), `ai`, `@ai-sdk/openai`, and `zod` (all already installed) cover everything this phase needs.
- **A real schema migration is required** — the first since `disala-08`'s calendar-update phase explicitly had none. `npx prisma migrate dev` generates and applies it; this is flagged clearly rather than treated as routine, per this project's own established caution around migrations.

## Files expected to change

New:
- `prisma/migrations/<timestamp>_add_contacts/migration.sql` — generated by `prisma migrate dev`, not hand-written.
- `lib/contacts.ts` — `createContact`, `listContacts`, `searchContacts`, `deleteContact` (mirrors `lib/notes.ts` exactly in style).
- `lib/extract-contact-card.ts` — `extractContactFromImage(imageBytes, mediaType)`, the `generateObject` vision call; its own small `{ ok: true; data } | { ok: false; error }` result shape (not `GoogleApiResult`, which is Google-specific and irrelevant here).
- `app/api/contacts/extract/route.ts` — `auth()`-gated route accepting the uploaded photo, returns extracted fields or an honest error; never persists the image.
- `app/contacts/page.tsx` — the Contacts list page (mirrors `/notes`'s structure: header, dynamic count, `ContactComposer`, `CaptureContactButton`, the list).
- `app/contacts/actions.ts` — `createContactAction`, `deleteContactAction` (mirrors `app/notes/actions.ts` exactly).
- `components/disala/contact-card.tsx`, `components/disala/contact-row.tsx` — mirror `note-card.tsx`/`note-row.tsx`.
- `components/disala/contact-composer.tsx` — the compact manual-add form (decision #8).
- `components/disala/scan-card-sheet-context.tsx`, `components/disala/scan-card-sheet.tsx` — the new global sheet + provider (decisions #6-7).
- `components/disala/capture-contact-button.tsx` — opens the scan sheet, placed on `/contacts` (mirrors `capture-note-button.tsx`).

Modified:
- `prisma/schema.prisma` — add `ContactSource` enum, `Contact` model, `contacts Contact[]` on `User`.
- `lib/agent/tools.ts` — add `search_contacts`, `create_contact` (10 → 12 tools total).
- `components/disala/app-header.tsx` — add the third `UserButton.Link` for `/contacts`.
- `app/layout.tsx` — mount `ScanCardSheetProvider` alongside `VoiceSheetProvider`.

Not touched: everything under `lib/integrations/gmail*`, `app/mail/**`, `app/api/chat/**`, `app/api/transcribe/**`, `app/api/speak/**`, `components/disala/voice-sheet*.tsx`, `components/disala/use-voice-recorder.ts`, `lib/integrations/calendar.ts`, `app/calendar/**`, `lib/notes.ts`, `app/notes/**`, `lib/approvals.ts`, `prisma`'s existing models/migrations (only additive changes), `components/disala/bottom-nav.tsx`.

## Functional requirements

- From `/contacts`: typing a name (required) + optional company/email/phone into `ContactComposer` and saving creates a `MANUAL` contact immediately, no approval, list updates without a reload (via the same `revalidatePath` mechanism `/notes` already uses).
- Tapping "Scan business card" opens the new sheet; choosing/taking a photo shows a loading state, then an editable review form pre-filled with whatever was extracted (missing fields simply appear blank, never fabricated placeholders).
- "Save Contact" is disabled until `name` is non-empty; tapping it creates a `BUSINESS_CARD` contact with exactly the (possibly user-edited) reviewed fields, closes the sheet, and the `/contacts` list reflects it without a manual reload.
- "Retake" discards the current extraction and returns to the capture step without saving anything.
- A failed extraction (bad photo, network error, provider error) shows an honest message and a way to try again — never a fabricated set of fields.
- Deleting a contact from the list removes it immediately (matching Notes' delete UX) and cannot delete another user's contact.
- In chat or voice, asking Disala something that requires a saved contact's info (e.g. "email Sarah Fernando about tomorrow") resolves via `search_contacts` and can proceed into the existing `propose_email` flow using the found address — still approval-gated at the send step, unchanged.
- Asking Disala to save a new contact conversationally (e.g. "add John, 071-234-5678, as a contact") creates one immediately via `create_contact`, the same no-approval treatment `create_note` already has.

## Security considerations

- Every new query/action is scoped by `userId` derived server-side from `getOrCreateInternalUser()` — never from client input — identical to every existing user-owned model in this codebase.
- `app/api/contacts/extract` requires a signed-in Clerk session (`auth()` → 401), identical to `/api/transcribe`/`/api/speak` — no anonymous use of a billable OpenAI endpoint.
- The uploaded photo is never written to disk or the database; it exists only for the duration of the one extraction call.
- `Contact` gets RLS enabled (zero policies, matching this repo's existing defense-in-depth convention) and an indexed `userId` foreign key.
- `create_contact`'s and `search_contacts`' `inputSchema`s carry no `userId`/`conversationId` — both are captured by `buildAgentTools`'s closure, the same non-negotiable property every existing tool already has, so the model has no parameter it could use to reach another user's contacts.
- Contact fields render as plain React text content everywhere (list, review form values) — no `dangerouslySetInnerHTML` — so a hostile business card's printed text (or a model-generated field) cannot inject markup.

## AI/agent behavior

- `search_contacts({ query: string })` — returns a minimal safe shape (`id, name, company, title, email, phone`) for matching contacts; no approval, matches `search_notes`'s treatment exactly.
- `create_contact({ name: string, company?, title?, email?: (validated email), phone?, website?, address? })` — creates a `MANUAL`-sourced contact immediately; no approval, matches `create_note`'s treatment and its exact justification ("the user's own first-party data, same as if they typed it themselves").
- System prompt addition: when a task needs someone's contact details (an email address to draft to, a phone number, etc.) and the person hasn't been mentioned with those details in the current conversation, check `search_contacts` before asking the user or guessing — mirroring how the agent is already expected to use `get_calendar_events` before proposing a meeting change rather than guessing an event id.
- The agent must never present a `search_contacts` miss as "this person doesn't exist" — only as "I don't have contact info saved for them," since a saved-Contacts miss says nothing about the person, only about what's been captured in this app.

## Approval requirements

Not applicable, per your choice — creating, reading, or deleting a Contact is the user's own first-party data with no external effect, the same category `AGENTS.md` §7.3 already puts Notes in. No new `ApprovalActionType`, no `/approvals` page change. (Any later action that *uses* a contact's info to affect something external — e.g. `propose_email` sending to their address — already goes through the existing, unchanged approval gate for that action.)

## Error handling

- `extractContactFromImage` never throws for an expected failure (missing/corrupt image, provider error) — it returns `{ ok: false, error }`, and `/api/contacts/extract` maps that to a non-200 JSON response, mirroring `/api/transcribe`'s contract.
- `createContactAction`/`deleteContactAction` follow `app/notes/actions.ts`'s exact pattern: throw a plain `Error` with a user-presentable message on auth failure, empty-name, or not-found/not-yours; the calling component catches it into local state and shows it, never silently swallowing it.
- A `/api/contacts/extract` failure never leaves the sheet stuck on "Reading card…" — it always transitions to the Error state with a way to retry.

## Acceptance criteria

- Scanning a real business card produces a review form whose fields plausibly match what's printed on the card; editing a field before saving persists the edited value, not the original extraction.
- Saving (scan or manual) makes the new contact appear in `/contacts` without a page reload.
- Deleting a contact removes it immediately and a second user's contacts are never visible to the first (verified directly in Postgres with two test accounts).
- Asking Disala to email or otherwise use a saved contact's info resolves correctly via `search_contacts` and reaches the existing, unchanged approval gate for the actual send.
- Asking Disala to save a new contact by voice/text creates it immediately, matching `create_note`'s no-approval behavior.
- `contacts` has RLS enabled and an index on `userId`, verifiable directly in Postgres (`\d contacts` / `pg_indexes`).
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npx prisma validate` all pass.
- Grepping the diff confirms zero changes under every path listed in "Not touched" above.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma validate`
- `npx prisma migrate dev` (creates and applies the new migration locally)

## Manual test steps

1. `npx prisma migrate dev`, then `npm run dev`. Open the `UserButton` menu; confirm "Contacts" appears alongside "Connections" and "Approvals"; open `/contacts` — confirm an empty state, the quick-add composer, and "Scan business card".
2. Type a name and email into the quick-add composer, save. Confirm it appears in the list immediately with no page reload, `source = MANUAL` in Postgres.
3. Tap "Scan business card", choose/take a photo of a real business card. Confirm the loading state, then a review form with plausible extracted fields.
4. Deliberately edit one field (e.g. fix a misread phone number) before saving. Confirm the saved row in Postgres reflects your edit, not the raw extraction.
5. Tap "Scan business card" again, then "Retake" partway through review. Confirm nothing was saved and you're back at the capture step.
6. Force a bad extraction (a blank/blurry photo, or block network to `/api/contacts/extract`). Confirm an honest error state with a working "Try again", and no phantom contact created.
7. Delete a contact from the list; confirm it disappears immediately and is gone from Postgres.
8. In chat or voice, ask Disala to email one of your saved contacts about something. Confirm it finds the right address via `search_contacts` and produces the normal `propose_email` approval card — nothing about this phase changed the approval step itself.
9. Ask Disala (by voice or text) to save a new contact directly in conversation ("add Priya, priya@x.com, as a contact"). Confirm it's created immediately, no approval card, and appears in `/contacts`.
10. Sign in as a second test user; confirm their `/contacts` is empty and neither user's rows are visible to the other, checked directly in Postgres.
11. Run `npx prisma validate`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — confirm all pass.
12. Confirm `/mail`, `/calendar`, `/notes`, and the voice/chat flows are visually and functionally unchanged (regression check, since this phase should have touched none of those files).

---

## Manual setup required before I can implement/test this

None for connecting anything new — `OPENAI_API_KEY` is already configured and covers the vision call. Two things worth doing yourself:
- Have a real business card (yours or any real one) ready to photograph for testing — a screenshot of a card or a very blurry photo will still exercise the flow but won't tell you much about real-world extraction quality.
- This phase runs a real `prisma migrate dev` against your database — a schema change, not just new application code. Say the word if you'd like to review the generated SQL before it's applied, otherwise I'll run it as part of implementation.

Is this good to execute?
