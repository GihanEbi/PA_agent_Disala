# Implementation Prompt: Mail, Calendar, Notes pages + Voice sheet + routing

## Goal

Implement the three remaining list screens — [design/disala-02-mail.png](../design/disala-02-mail.png), [design/disala-03-calendar.png](../design/disala-03-calendar.png), [design/disala-04-notes.png](../design/disala-04-notes.png) — as real routes (`/mail`, `/calendar`, `/notes`), implement the "Ask Disala" voice bottom sheet from [design/disala-05-voice.png](../design/disala-05-voice.png), and wire real navigation between all four screens (bottom nav tabs, Home's insight rows, and the mic buttons that open the voice sheet). This closes out the screens deferred by `prompts/disala-01-home.md`.

Out of scope (still presentation-layer only, per AGENTS.md's phased approach):
- Any real Gmail/Calendar/Notes data, AI agent wiring, tool calls, or approvals — all four pages keep using static sample content, consistent with the Home page precedent.
- Making the voice sheet actually listen/transcribe, or making its suggestion chips / keyboard toggle functional — the reference only specifies the idle visual state.
- The "Ask Disala" / "Ask Disala to reply" links inside email and event rows doing anything beyond existing visually (no click handler) — no conversational agent exists yet for them to hand off to.

## Relevant skills

None invoked — reuses the primitives already built by `disala-design-system` and `disala-01-home`; no new shadcn scaffolding.

## Existing code inspected

- `prompts/disala-01-home.md` — approved prompt and its architectural decisions, several of which this prompt continues under: no shared layout/route-group ("each future page prompt will import `AppHeader`/`AppFooter` directly"), `VoiceOrb` sized for reuse ("disala-05-voice.png shows the identical orb, just smaller"), insight rows explicitly deferred as non-interactive until "those pages ship" (they now do).
- `app/page.tsx` — current Home implementation: server component, calls `currentUser()` from `@clerk/nextjs/server` for `name`/`avatarInitial`, renders `AppHeader`, `VoiceOrb`, three `InsightRow`s, `AppFooter`.
- `components/disala/{app-header,app-footer,bottom-nav,voice-orb,insight-row}.tsx` — `AppHeader` (greeting/date/avatar, unchanged here); `AppFooter` (fixed mic button + `BottomNav`, currently has no interactivity); `BottomNav` (plain `<button>`s, no navigation, `NavKey` = `home | mail | calendar | notes`); `VoiceOrb` (`size` prop, already built for reuse at a smaller size); `InsightRow` (icon badge + title/subtitle + chevron, no click handler).
- `components/disala/{email-card,event-card,note-card}.tsx` — the "card" style used in `app/style-guide/page.tsx`: `rounded-md bg-card p-4`. Compared pixel-for-pixel against the three new reference images: the *content* (avatar+time row, sender/subject/preview stack; time+title+badge, attendees, Ask Disala link; title+timestamp+preview) is structurally identical to these cards — only the container styling differs (no card background/radius, `border-b` divider instead, no outer padding). `EventCard`'s "Ask Disala" text button also already exists, just unconditional.
- `components/ui/{button,badge}.tsx` — `Button variant="text"` is already teal, underline-on-hover — matches the "Ask Disala" / "Ask Disala to reply" links exactly. `Badge variant="attention"` already matches "Needs reply". Reused as-is.
- `app/layout.tsx` — `ClerkProvider` wraps `{children}`; no other providers yet.
- Compared all five reference images together: header (greeting+avatar) and footer (mic+nav) are pixel-identical across Home/Mail/Calendar/Notes (confirmed in the Home prompt already). `disala-05-voice.png` is literally the Home screen with a bottom sheet overlaid on top and the background dimmed — same header, same dimmed insight rows visible behind it, same small `VoiceOrb`.
- No `middleware.ts` exists; routes are unprotected today (same as `/`), so no auth-gating decision is introduced by this prompt.

## Architectural decisions

1. **New routes, no shared layout/route-group**, continuing the Home prompt's explicit decision: `app/mail/page.tsx`, `app/calendar/page.tsx`, `app/notes/page.tsx`, each importing `AppHeader`/`AppFooter` directly, matching `app/page.tsx`'s existing structure (`max-w-md` centered column, `pt-8 pb-32` content area).
2. **Extend `EmailCard`, `EventCard`, `NoteCard` with a `variant?: "card" | "flat"` prop** (default `"card"`, so `app/style-guide/page.tsx`'s existing usage and appearance is unchanged) rather than creating three near-duplicate row components. The reference images show the exact same content shape as these existing cards, just without the card chrome — this is a direct, non-speculative reuse case, not the "InsightRow is its own flat thing" case from the Home prompt (that row's *content* shape genuinely differs from any card). Concretely:
   - `EmailCard` gains optional `replyLabel?: string`, rendered as a `Button variant="text"` next to `status`'s `Badge` (only when both are supplied — Mail's non-reply-needed row passes neither).
   - `EventCard` gains `showAskDisala?: boolean` (default `true`, preserving the style guide's current unconditional rendering); Calendar page passes `showAskDisala={event.upNext}` since the reference only shows the link under the "Up next" event.
   - All three: `variant: "flat"` swaps the wrapper's `rounded-md bg-card p-4` for `border-b border-border py-4` (divider-list styling), everything else unchanged.
3. **New `SectionHeader` component** (`title` left in `font-display`, `meta` text right in muted body), extracted immediately rather than after a third use, because "Inbox / 3 need a reply", "Today / 4 things today", and "Notes / 3 total" are proven identical layout across all three reference images being implemented in this same prompt (not speculative).
4. **Small extracted server helper for the header identity**: `lib/disala-user.ts` exporting `getHeaderIdentity()` (the `currentUser()` → `{name, avatarInitial, online}` logic currently inlined in `app/page.tsx`). Justified the same way the Home prompt justified extracting `AppHeader`/`AppFooter`: this prompt makes the logic identical across four call sites in one change, not a hypothetical future one.
5. **Global voice sheet via React context**, not per-page state, because the mic button that opens it lives in `AppFooter` (rendered on all four pages) and the reference shows it opening from any of them with identical behavior:
   - `components/disala/voice-sheet-context.tsx` (`"use client"`): `VoiceSheetProvider` (holds `open` state) + `useVoiceSheet()` hook (`openSheet`/`closeSheet`). The provider renders `{children}` plus the sheet overlay itself, so wiring it once in `app/layout.tsx` (`<VoiceSheetProvider>{children}</VoiceSheetProvider>`, inside `ClerkProvider`) makes it available everywhere without turning any page into a client component.
   - `components/disala/voice-sheet.tsx` (`"use client"`, rendered by the provider): backdrop + bottom sheet panel, built from existing primitives (`VoiceOrb`, `Icon`, `Button`).
   - `AppFooter` becomes `"use client"` (it's a small, purely presentational component with no server data — safe to convert) and its mic button calls `openSheet()`.
   - Home's large hero orb needs the same trigger but `app/page.tsx` is an async server component (`currentUser()`), so a new tiny client wrapper `components/disala/voice-orb-trigger.tsx` renders `<VoiceOrb>` inside a `<button onClick={openSheet}>`, used only on Home. `VoiceOrb` itself stays a plain presentational component, still reused undecorated for the sheet's own smaller orb.
6. **Routing**: `BottomNav`'s items get real `href`s (`/`, `/mail`, `/calendar`, `/notes`) via `next/link`; `active` stays an explicit prop passed by each page (as today) rather than switching to `usePathname`, since it's already correct per-page and keeps `BottomNav` a server-renderable component. `InsightRow` gains an optional `href` — when present it wraps its content in a `Link`; Home passes `/mail`, `/calendar`, `/notes` to its three rows respectively, replacing the placeholder non-interactive rows now that those routes exist (this is exactly the follow-up the Home prompt flagged: "This will be wired up when those pages ship").

## Assumptions

- **Sample data only**, matching each reference image, reusing established sample names (Priya Fernando, LankaHost, Kavindu Perera) where the image reuses them and inventing plausible filler only where the reference's text is visually truncated (e.g. the tail of an email preview cut off by "…"). None of this is real Gmail/Calendar/Notes data.
- **The 4 suggestion chips, the keyboard-toggle button, and the sheet's own mic button are visual-only** (no `onClick`), same reasoning as Home's hero orb in the previous prompt: there's no agent to hand a tap off to yet. This will need its own follow-up prompt once the AI agent exists.
- **Email/event "Ask Disala to reply" / "Ask Disala" inline links stay inert** (already the existing `EventCard` behavior) — only the *page-level* mic buttons (footer + Home hero orb) and *bottom-nav tabs* + *Home insight rows* get real interactivity in this prompt, since those are the two things the reference images and the user's "connect all with routing" request directly evidence.
- **Voice sheet closes on**: the X button, clicking the backdrop, and `Escape`. Body scroll is locked while it's open (standard bottom-sheet behavior; not shown in a static image but necessary for it to function correctly as a modal).
- **No auth-gating added** to the three new routes — they're exploratory/presentational like `/` and `/style-guide` today; a real auth boundary is a separate concern once these pages read real user data.

## Files expected to change

New:
- `app/mail/page.tsx`
- `app/calendar/page.tsx`
- `app/notes/page.tsx`
- `lib/disala-user.ts`
- `components/disala/section-header.tsx`
- `components/disala/capture-note-button.tsx` (the dashed "Capture a new note by voice" row; opens the voice sheet)
- `components/disala/voice-sheet-context.tsx`
- `components/disala/voice-sheet.tsx`
- `components/disala/voice-orb-trigger.tsx`

Modified:
- `app/layout.tsx` — wrap `children` in `VoiceSheetProvider`.
- `app/page.tsx` — use `getHeaderIdentity()`, use `VoiceOrbTrigger`, pass `href`s to `InsightRow`s.
- `components/disala/bottom-nav.tsx` — `next/link` navigation.
- `components/disala/app-footer.tsx` — `"use client"`, mic button opens the voice sheet.
- `components/disala/insight-row.tsx` — optional `href`.
- `components/disala/email-card.tsx` — `variant` + `replyLabel`.
- `components/disala/event-card.tsx` — `variant` + `showAskDisala`.
- `components/disala/note-card.tsx` — `variant`.

No changes to design tokens/fonts, `Icon`, `Badge`, `Button`, `ProgressBar`, `StatusDot`, `VoiceResponseCard`, `VoiceStateChip`, or `app/style-guide/page.tsx` (its existing card usages must render pixel-identical to today after this change).

## Functional requirements

- **`/mail`**: `AppHeader` + `SectionHeader title="Inbox" meta="3 need a reply"` + 4 `EmailCard variant="flat"` rows (Priya Fernando/Q3 budget review, LankaHost Billing/Invoice #2291, Design Weekly/5 layouts, Kavindu Perera/Dinner Friday), first/second/fourth with `status="Needs reply"` + `replyLabel="Ask Disala to reply"`, `AppFooter active="mail" unreadCount={3}`.
- **`/calendar`**: `AppHeader` + `SectionHeader title="Today" meta="4 things today"` + 4 `EventCard variant="flat"` rows (Design sync 9:30 AM/Up next/showAskDisala, Lunch 12:00 PM, Team standup 2:00 PM, Client call 4:30 PM), `AppFooter active="calendar" unreadCount={3}`.
- **`/notes`**: `AppHeader` + `SectionHeader title="Notes" meta="3 total"` + `CaptureNoteButton` (dashed pill, gold `+`, "Capture a new note by voice", opens voice sheet) + 3 `NoteCard variant="flat"` rows (Kavindu's birthday ideas, Grocery list, Follow up with Zeynep), `AppFooter active="notes" unreadCount={3}`.
- **Voice sheet**: opens from (a) `AppFooter`'s mic button on any page, (b) Home's hero orb, (c) `/notes`' capture-note button. Renders a dimmed full-screen backdrop + bottom sheet (drag handle, "Ask Disala" + close X, small `VoiceOrb`, "What can I help with?" heading, 2×2 suggestion pills, keyboard-icon button + mic button row). Sheet sits above `AppFooter` (visually covers it, matching the reference).
- **Routing**: bottom-nav tabs navigate between `/`, `/mail`, `/calendar`, `/notes` and show the correct active tab; Home's three insight rows navigate to `/mail`, `/calendar`, `/notes` respectively.
- Each page keeps the same responsive/scroll behavior established by Home (`max-w-md` centered column, content scrolls under the fixed footer, no horizontal scroll from ~360px up through desktop).

## Security considerations

None — still static presentational content and client-only UI state (sheet open/closed), no user input processed or persisted, no external calls, no new auth surface.

## AI/agent behavior

None — no agent or tool-calling logic in this prompt; the voice sheet is an inert visual shell for a future prompt to wire up.

## Approval requirements

None at runtime — nothing consequential exists on any of these screens yet (all mic/link/chip affordances are either pure navigation or currently inert). Per AGENTS.md §7.3 these remain read-only/presentational screens.

## Error handling

N/A — static UI, no data fetching, no failure states to model in this prompt.

## Acceptance criteria

- `npm run build` and `npm run lint` pass.
- `/mail`, `/calendar`, `/notes` visually match their reference images (header, section header, list rows with correct dividers/badges/links, footer with correct active tab).
- `app/style-guide/page.tsx`'s existing `EmailCard`/`EventCard`/`NoteCard` usages render unchanged (default `variant="card"` preserves current look).
- Bottom nav navigates correctly between all four routes from any of the four pages, with the correct tab shown active on each.
- Home's three insight rows navigate to `/mail`, `/calendar`, `/notes`.
- Tapping the mic button in `AppFooter` (on any of the four pages), Home's hero orb, or the Notes capture-note row opens the voice sheet matching `disala-05-voice.png`; the X button, backdrop click, and `Escape` all close it; background scroll is locked while open.
- No leftover unused props/components.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`, open `/`.
2. Compare `/mail`, `/calendar`, `/notes` against their reference images one by one: header, section header text, row content/dividers/badges/links, footer.
3. Click through the bottom nav on each page in a full loop (Home → Mail → Calendar → Notes → Home) and confirm the active tab highlight always matches the current page.
4. From Home, click each of the three insight rows and confirm they land on `/mail`, `/calendar`, `/notes` respectively.
5. Open the voice sheet from: Home's hero orb, the footer mic button on `/mail`, and the "Capture a new note by voice" row on `/notes`. Compare against `disala-05-voice.png` (drag handle, header, orb, heading, 4 suggestion pills, keyboard + mic row) each time.
6. Close the sheet each of the three ways (X, backdrop click, Escape) and confirm the underlying page is interactive again afterward (no leftover scroll lock or invisible overlay).
7. Resize each new page down to ~360px and up to desktop width — no horizontal scroll, content stays centered, footer stays pinned.

---

Is this good to execute?
