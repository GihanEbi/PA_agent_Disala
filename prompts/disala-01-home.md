# Implementation Prompt: Disala Home Page

## Goal

Implement the Home / main assistant screen defined in [design/disala-01-home.png](../design/disala-01-home.png) as the app's root route (`app/page.tsx`), replacing the current `create-next-app` starter content. This is the primary conversational entry point described in AGENTS.md §3/§19 — greeting, voice-first hero, and an at-a-glance summary of what needs attention.

Out of scope (each gets its own future prompt against its own reference image, per the pattern already established by `prompts/disala-design-system.md`):
- The "Ask Disala" voice bottom-sheet (`design/disala-05-voice.png`) — tapping the mic does not open it yet.
- Mail / Calendar / Notes pages (`design/disala-02..04-*.png`).
- Any real Gmail/Calendar/Notes data, AI agent wiring, or approvals — this is presentation-layer only, using static sample content.

## Relevant skills

None invoked — this reuses the primitives already built by the `disala-design-system` prompt; no new shadcn scaffolding or design-token work is needed.

## Existing code inspected

- `prompts/disala-design-system.md` — the approved design-system prompt and its rationale.
- `app/globals.css`, `app/layout.tsx` — tokens and fonts (Fraunces `font-display`, Manrope `font-sans`) already wired.
- `components/ui/{button,input,select,badge}.tsx` — shadcn primitives, restyled to Disala tokens.
- `components/disala/*` — `Icon` (24px, 1.6px stroke wrapper), `BottomNav` (flat 4-tab pill nav, unread badge on Mail), `StatusDot`, `ProgressBar`, `EmailCard`, `EventCard`, `NoteCard`, `VoiceResponseCard`, `VoiceStateChip`.
- `app/style-guide/page.tsx` — reference for how existing components are composed and which sample copy is already established (Priya Fernando, LankaHost Billing, "Design sync" 9:30 AM, "Grocery list", etc.) — reused here for content consistency.
- `app/page.tsx` — currently the unmodified `create-next-app` template; will be fully replaced.
- Compared all three available page mockups (`disala-01-home.png`, `disala-02-mail.png`, `disala-03-calendar.png`) side by side: the header (greeting + date + avatar) and the footer (floating mic button + `BottomNav`) are pixel-identical across all three, only the middle content area changes per page. This directly motivates extracting those two regions as reusable components now, rather than duplicating them when Mail/Calendar prompts land later.
- `package.json` — confirms `lucide-react`, `class-variance-authority`, `@base-ui/react` already installed; no new dependencies needed for this page.

## Architectural decisions

1. **Extract two new shared components**, since the header and footer are already proven identical across three separate reference images (not speculative reuse):
   - `components/disala/app-header.tsx` — greeting + date (left) and avatar badge (right). Props: `name`, `avatarInitial`, `online?: boolean`. Date/greeting are computed at render time (see Assumptions), not hardcoded strings.
   - `components/disala/app-footer.tsx` — the fixed-position footer: glowing circular mic button (built from the existing `Button` primitive, `variant="primary"` `size="icon"`, enlarged) sitting above `BottomNav`. Props mirror `BottomNav`'s: `active: NavKey`, `unreadCount?: number`.
   No new "AppShell"/layout route-group is introduced — Mail/Calendar/Notes routes don't exist yet, so restructuring `app/` for them now would be speculative. Each future page prompt will import `AppHeader`/`AppFooter` directly, the same way this one does.
2. **New page-specific components** under `components/disala/`, small and single-purpose (matching the granularity already used for `EmailCard`/`EventCard`/`NoteCard`):
   - `voice-orb.tsx` — the large soft gold→teal gradient sphere with a thin outer ring and centered mic icon. Takes a `size` prop (px) so the same component can be reused at a smaller size by the future voice-sheet prompt (`disala-05-voice.png` shows the identical orb, just smaller) — this is direct evidence from an already-provided reference image, not speculative.
   - `insight-row.tsx` — the flat (non-card) divider-separated list row: tinted icon badge + heading + muted subtext + trailing chevron. Used for the three "3 emails need your reply" / "Design sync at 9:30 AM" / "3 notes saved" rows. Rows are presentational only in this prompt (no `onClick`/navigation — their target pages don't exist yet).
3. **Root layout strategy**: the reference is a mobile mock. Per AGENTS.md §3 ("no mobile reference... make each page responsive down to mobile"), I'm treating §3 literally in reverse here — this *is* effectively the mobile reference, and the page must also degrade sensibly on wider viewports. I'll center the whole screen in a `max-w-md` column on larger viewports (phone-width app panel on a wide window) rather than stretching the layout full-bleed, which would look broken relative to the reference. This mirrors a common, low-risk pattern for voice/chat-first apps and avoids inventing a desktop-specific layout that has no reference.
4. **Fixed footer**: `AppFooter` is `fixed inset-x-0 bottom-0`, constrained to the same `max-w-md` column via a centered wrapper, so it stays aligned under the content instead of spanning the full viewport width on desktop. The scrollable content area gets bottom padding equal to the footer's height so content is never hidden behind it.
5. The device frame's rounded top corners visible in the PNG are screenshot/mockup chrome (a phone frame), not a UI element — not reproduced.

## Assumptions

- **Sample data only.** Name ("Amaya"), avatar initial ("A"), online-status dot, unread mail count (3), and all three insight rows' content are hardcoded placeholder constants in `app/page.tsx`, matching the reference and reusing sample names already established in `app/style-guide/page.tsx` (Priya Fernando, LankaHost Billing, "Design sync", "Grocery list") for consistency. They will be replaced by real Gmail/Calendar/Notes/user data in later, separate prompts once those integrations exist (AGENTS.md §9–11).
- **Date/greeting are computed, not frozen text.** The reference shows "Good morning, Amaya" / "Wednesday, September 2" as sample content for whatever day the mock was made. I'll compute the weekday+date from the real current date, and compute "Good morning/afternoon/evening" from the current hour, since a frozen date would be visibly wrong every day thereafter. The name stays a hardcoded placeholder (no user/auth data model exists yet).
- **Insight rows are non-interactive in this prompt.** The chevron is reproduced for visual fidelity, but there's no click handler — Mail/Calendar/Notes routes don't exist yet. This will be wired up when those pages ship.
- **Mic button (hero orb and floating footer button) are visual-only.** No `onClick`, no listening state — the voice bottom-sheet interaction is `disala-05-voice.png`'s own future prompt.
- **`BottomNav`'s Home/Mail/Calendar/Notes buttons stay non-navigating**, consistent with its current implementation (plain `<button>`, no `href`/`onClick`) — not changed by this prompt.

## Files expected to change

- `app/page.tsx` — full rewrite: Home screen.
- New: `components/disala/app-header.tsx`
- New: `components/disala/app-footer.tsx`
- New: `components/disala/voice-orb.tsx`
- New: `components/disala/insight-row.tsx`

No changes to design tokens, fonts, or existing shared components (`BottomNav`, `Button`, `Icon`, etc.) — this prompt only consumes them.

## Functional requirements

- `AppHeader`: `font-display` greeting (Display 1, 24/29 medium) + muted date line (Body), avatar circle (gold→teal gradient, initial in `font-display`, small success-colored status dot bottom-right with a page-background ring so it reads as a cutout).
- `VoiceOrb`: centered, soft blurred gold→teal radial gradient sphere, thin 1px outer ring, mic icon centered (neutral-900, matching the icon-on-gold contrast used in `Button`'s primary variant), "Tap and just start talking" caption (Small, muted) beneath it.
- Insight list: a divider above the first row and below every row (including the last), each row = `InsightRow` with a tinted icon badge (mail → gold tint, calendar → teal tint, notes → neutral tint, reusing the same tint scale as `Badge`'s `attention`/`schedule`/`neutral` variants), heading text, muted subtext, trailing `ChevronRight`.
- `AppFooter`: enlarged circular primary mic button (glow via existing `shadow-lg`/`shadow-xl` tokens) floating above `BottomNav`; `BottomNav` rendered with `active="home"` and `unreadCount={3}`.
- Whole page scrolls independently of the fixed header/footer if content overflows a short viewport; footer never overlaps unscrolled content (bottom padding on the content area).
- Responsive: no horizontal scroll or broken layout from small mobile widths up through desktop; content column stays phone-width and centered on wide viewports (see Architectural decision 3).

## Security considerations

None — static presentational content, no user input processed, no external calls, no auth.

## AI/agent behavior

None — no agent or tool-calling logic in this prompt.

## Approval requirements

None at runtime (no consequential action exists on this screen yet — mic is inert). Per AGENTS.md §7.3 this is a read-only/presentational screen. The standard prompt-approval step below still applies before implementation starts.

## Error handling

N/A — static UI, no data fetching, no failure states to model in this prompt.

## Acceptance criteria

- `npm run build` and `npm run lint` pass.
- `/` visually matches `design/disala-01-home.png`: header, orb + caption, divider, three insight rows with correct icon tints, footer (mic + nav with unread badge on Mail).
- Page is fully responsive: no horizontal scroll or clipped content from ~360px width up to desktop widths; footer stays pinned and centered.
- All new components (`AppHeader`, `AppFooter`, `VoiceOrb`, `InsightRow`) have no unused props and are used at least once on `/`.
- No leftover `create-next-app` starter content (Next.js/Vercel boilerplate) in `app/page.tsx`.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`, open `/`.
2. Compare against `design/disala-01-home.png`: greeting/date, avatar gradient + status dot, orb gradient/ring/icon/caption, divider placement, all three insight rows (icon tint, heading, subtext, chevron), floating mic button glow, bottom nav active state + unread badge.
3. Confirm the greeting's weekday/date reflects today's actual date, and the greeting word matches the current time of day.
4. Resize down to a narrow mobile width (~360px) and up to a wide desktop width — confirm no horizontal scroll, content stays centered at phone width on desktop, and the footer stays correctly pinned/aligned in both cases.
5. Scroll test: temporarily add extra rows (or shrink the viewport height) to confirm content scrolls under the fixed footer without the footer ever obscuring un-scrolled content.

---

Is this good to execute?
