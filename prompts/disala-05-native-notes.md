# Disala — Backend Phase 2: Native Notes (data layer + real /notes page)

## Goal

Give Disala a real, first-party Notes feature backed by our own Postgres table (per your earlier decision: no Google Keep, since it has no public consumer API). This phase covers:

1. A `Note` Prisma model + CRUD data layer, reusable later by the Notes tool layer (`notes.createNote`, `notes.searchNotes`, per `AGENTS.md` §5/§11).
2. Wiring `/notes` to real data instead of the static sample array.
3. A minimal, interim "quick note" text composer and a delete action, so the feature is actually usable and testable before the AI agent exists.

Out of scope:
- Natural-language note capture ("Remember that the Acme proposal needs to be sent before Friday"). Per `AGENTS.md` §11/§20, that's the AI agent parsing free-form speech/text and deciding it's a note (vs. a reminder, vs. a question) — it can't exist before the agent does (Phase 4). The existing "Capture a new note by voice" button and the voice sheet's mic/keyboard toggle stay exactly as inert as the previous prompt left them.
- Searching notes by natural language ("What did I write about the Acme proposal?") — deferred to the Gmail/Calendar/Notes tool-layer phase, alongside the other read tools.
- Updating an existing note's content — not shown in the reference design, and nothing in this phase's scope needs it yet (create + list + delete cover the current UI).

## Relevant skills

- `supabase-postgres-best-practices` — schema/migration change.

## Existing code inspected

- `app/notes/page.tsx` — static `NOTES` sample array (3 items: title/timestamp/preview strings), `CaptureNoteButton`, `NoteCard variant="flat"` rows. Server Component.
- `components/disala/note-card.tsx` — pure presentational (`title`, `timestamp`, `preview`, `variant`), no `id`, no interactivity. Also used unchanged in `app/style-guide/page.tsx` with static props — must keep rendering pixel-identical there.
- `components/disala/capture-note-button.tsx` — `"use client"`, only calls `openSheet()` from `useVoiceSheet()`. No capture logic exists.
- `components/disala/voice-sheet.tsx` — confirms the "keyboard" toggle button is visual-only (no `onClick`) — this is the actual intended free-text entry point once the agent exists, not something to wire up now.
- `prisma/schema.prisma` — `Reminder.source: ReminderSource` (`USER | ASSISTANT`) is exactly the "who created this" distinction Notes also need — reusable rather than adding a near-duplicate enum.
- `lib/get-or-create-user.ts`, `lib/db.ts` (Phase 1) — the internal-user resolution and Prisma singleton this phase reuses as-is.
- `components/ui/input.tsx` — existing styled input primitive; no `Textarea` primitive exists yet.

## Architectural decisions

1. **Rename `ReminderSource` → `CreationSource`** (values unchanged: `USER`, `ASSISTANT`) and use it for both `Reminder.source` and the new `Note.source`. Pure rename, same two values, no behavior change to `Reminder` — avoids adding a second identical enum just because it was originally named after one model.
2. **`Note` schema**: `id`, `userId` (→ `User`, cascade delete), `title String?` (nullable — see #4), `content String`, `source CreationSource @default(USER)`, `createdAt`, `updatedAt`. No full-text-search column/index yet — `AGENTS.md` §11's "searchable through natural language" is an agent-tool concern (next phase); until then, a plain `contains` filter over a handful of rows needs no special indexing.
3. **Data layer in `lib/notes.ts`** (server-only), separate from the Server Actions that call it — `createNote`, `listNotes`, `deleteNote`. This is the same shape the future `notes.createNote`/`notes.searchNotes` agent tools will wrap (per `AGENTS.md`'s tool-layer diagram: validated business logic underneath, permission/approval checks in the layer that calls it) — building it now as a plain reusable module, not a Server-Action-only implementation, means Phase 4 wraps it instead of rewriting it.
4. **No separate "title" field in the interim composer.** The quick-capture composer is a single multi-line text field (content only), matching the "one utterance" spirit of "Capture a new note" — `title` stays `null` for these, and the UI derives a display title from the first ~48 characters of `content` when `title` is absent. A real `title` field remains in the schema for later, richer note creation (e.g. the agent proposing its own concise title, matching the static sample data's style) — that's populated by Phase 4, not invented here.
5. **Delete is scoped by ownership at the query level**: `deleteNote({ userId, noteId })` deletes via `deleteMany({ where: { id: noteId, userId } })`, never a bare `delete({ where: { id } })` — this is the only thing standing between "delete my own note" and "delete any note if you can guess its id" (`AGENTS.md` §16 user isolation). Returns whether a row was actually deleted so the Server Action can report failure honestly instead of assuming success.
6. **`NoteCard` itself is not modified.** Rather than adding an `onDelete` prop and converting it to a Client Component (which would touch its use in `app/style-guide/page.tsx` too), a new small wrapper `components/disala/note-row.tsx` (`"use client"`) renders the existing `NoteCard` unchanged and adds the delete affordance around it. Zero risk to the style guide's existing static reference.
7. **Deleting your own note is not a `AGENTS.md` §7.3 "Approval"** — same reasoning as Phase 1's Google-disconnect: this is you directly managing your own first-party data through the UI, not Disala performing a consequential action on your behalf. It does get a plain `window.confirm()` guard as ordinary UI hygiene, not a formal `Approval` record.
8. **New `components/ui/textarea.tsx`?** No — a single call site doesn't justify a new shared primitive yet; the composer's `<textarea>` is styled inline, copying `Input`'s existing token classes (`rounded-[20px] bg-input`, etc.) directly. Extract a shared primitive the next time a second call site needs one.

## Assumptions

- Single multi-line text composer is a deliberate stand-in for real voice/agent capture, not a designed screen — there's no reference image for it, per `AGENTS.md` §3 ("you do not design UI... there is no mobile reference" — extended here to "no reference for this interim state either"). It's built from existing primitives (`Input`'s token classes, `Button`, `Icon`) rather than new visual design, and I expect it to be replaced or removed once Phase 4 makes the voice sheet's keyboard/mic capture real notes directly.
- `/notes`'s section meta ("N total") becomes the real count of the signed-in user's notes instead of a hardcoded "3 total".
- No pagination — a personal notes list starting at zero and growing slowly doesn't need it yet; add it if/when it does.
- Timestamps are formatted with a small new helper (`lib/format-timestamp.ts`) matching the sample data's style ("Today, 9:12 PM" / "Yesterday, 6:03 PM" / weekday name within 7 days / short date beyond that) — not a new dependency, just a small pure function.

## Files expected to change

New:
- `lib/notes.ts` — `createNote`, `listNotes`, `deleteNote`.
- `lib/format-timestamp.ts` — `formatNoteTimestamp(date: Date): string`.
- `app/notes/actions.ts` — `"use server"`, `createNoteAction`, `deleteNoteAction`.
- `components/disala/note-composer.tsx` — `"use client"`, the interim quick-capture textarea + submit button.
- `components/disala/note-row.tsx` — `"use client"`, wraps `NoteCard` + adds the delete button.
- `prisma/migrations/**` — new migration (enum rename + `Note` table).

Modified:
- `prisma/schema.prisma` — `ReminderSource` → `CreationSource`; new `Note` model; `User.notes Note[]` relation.
- `app/notes/page.tsx` — replace the static `NOTES` array with `listNotes(internalUser.id)`; render `NoteComposer` and map real notes through `NoteRow`; real "N total" count.

Not touched: `components/disala/note-card.tsx`, `components/disala/capture-note-button.tsx`, `components/disala/voice-sheet.tsx`, `app/style-guide/page.tsx`.

## Functional requirements

- Visiting `/notes` while signed in shows the signed-in user's own notes only (never another user's), newest-updated first, with the real count in the section meta.
- Typing text into the quick-capture composer and submitting creates a `Note` row (`source = USER`, `title = null`) and it appears in the list immediately (no manual refresh).
- Submitting empty/whitespace-only text does nothing (client-side guard + server-side re-check — never trust the client alone).
- Each real note row has a delete affordance; confirming removes it from the database and the list, scoped so it only ever deletes a note the signed-in user owns.
- `app/style-guide/page.tsx`'s existing static `NoteCard` usage renders exactly as before.

## Security considerations

- Every `lib/notes.ts` call is reached only through Server Actions that resolve `userId` from the authenticated Clerk session server-side — never from a client-supplied `userId`.
- `deleteNote` scopes the delete by `userId` in the same query as the `id` lookup (see decision #5) — the only way this is safe.
- No note content is ever sent to an LLM in this phase — there's no agent yet to send it to.

## AI/agent behavior

Not applicable — no agent or tool-calling code in this prompt. `lib/notes.ts` is written so the Phase-4 agent tools can call it directly, but nothing calls it yet.

## Approval requirements

Not applicable, per decision #7 — you creating/deleting your own note directly through the UI isn't a consequential action Disala takes on your behalf.

## Error handling

- `createNoteAction`/`deleteNoteAction` throw on empty content / not-found-or-not-yours rather than silently no-op-ing, so the composer/row can surface a real error instead of pretending it worked.
- Database errors propagate (not swallowed) — the composer shows a generic "couldn't save that note" state rather than silently losing the user's text.

## Acceptance criteria

- `npx prisma migrate dev` applies cleanly; `notes` table exists; `Reminder.source` still works with the renamed enum.
- Creating a note via the composer persists it and it appears in the list without a manual page reload.
- Deleting a note removes it after confirmation.
- A note belonging to another test user cannot be deleted by guessing its id (verified manually — see below).
- `app/style-guide/page.tsx`'s `NoteCard` panel is visually unchanged.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx prisma validate`

## Manual test steps

1. `npx prisma migrate dev`, confirm the `notes` table and renamed `CreationSource` enum in Supabase's Table Editor.
2. Sign in, visit `/notes`, type a note into the composer, submit — confirm it appears at the top of the list and the "N total" count updates.
3. Delete that note, confirm the browser prompt, confirm it disappears from the list and from the Table Editor.
4. Try submitting an empty composer — confirm nothing is created.
5. As a second signed-in test user, confirm you only ever see your own notes, never the first user's.
6. Manually attempt to call `deleteNoteAction` with another user's real note id (e.g. via the browser console while signed in as user B) — confirm it throws "not found" rather than deleting user A's note.
7. Open `/style-guide`, confirm the Notes panel still matches its current appearance exactly.

---

Is this good to execute?
