# Implementation Prompt: Disala Design System

## Goal

Implement the visual design system defined in [design/disala-design-system.png](../design/disala-design-system.png) as reusable design tokens and UI primitives in the Next.js app. This is a foundation task: it does not build any product page (Home, Mail, Calendar, Notes) — those each have their own reference image and will be separate implementation prompts. The output of this task is:

1. Design tokens (color, type, spacing, radius, shadow) wired into Tailwind v4.
2. The two fonts (Fraunces, Manrope).
3. A set of reusable, styled UI primitives matching the reference exactly.
4. A `/style-guide` page that renders every token and component so it can be visually diffed against the reference image.

## Relevant skills

- `shadcn-ui` — used to scaffold Button/Input/Badge as CVA-based primitives, then restyle to Disala tokens.

## Existing code inspected

- Fresh `create-next-app` output: `app/layout.tsx`, `app/page.tsx`, `app/globals.css` are all template defaults (Geist fonts, generic Tailwind v4 setup via `@import "tailwindcss"` + `@theme inline`).
- Tailwind v4 (`^4`) with `@tailwindcss/postcss`, no `tailwind.config.ts` (v4 is CSS-first).
- No `components.json`, no `lib/utils.ts`, no `components/` directory — shadcn/ui has not been initialized.
- `tsconfig.json` has `@/*` → project root path alias.
- No existing prompts in `prompts/`.
- `design/` contains the design-system sheet plus 5 page references (`disala-01-home.png` … `disala-05-voice.png`) that are explicitly out of scope for this prompt.

## Design values extracted from the reference image (pixel-sampled, not eyeballed)

**Colors**
- Gold (primary — voice & action): 500 `#E7A94C`, 400 `#ECBB6B`, 300 `#F0CD8D`, 200 `#F6DFB4`, 100 `#FBF0DC`
- Teal (secondary — time & schedule): 500 `#4FB8AE`, 400 `#6FC5BC`, 300 `#8FD3CB`, 200 `#B5E2DC`, 100 `#DBF1EE`
- Neutral: 900 `#0D1117`, 800 `#161C25`, 700 `#1E2631`, 500 `#5B6472`, 300 `#8D95A3`, Warm white `#F3EFE7`
- Semantic: Success `#6FCF97`
- Surfaces (pixel-sampled, not labeled swatches): page background = Neutral 900, panel/card/input background = Neutral 800.

**Typography** — Fraunces (display) + Manrope (UI text), both via `next/font/google`:
| Style | Font | Size/Line | Weight | Use |
|---|---|---|---|---|
| Display 1 | Fraunces | 24/29 | Medium | Greeting header |
| Display 2 | Fraunces | 18/23 | Medium | Section headings |
| Display 3 | Fraunces | 17/26 | Regular | What the assistant says back |
| Heading | Manrope | 15/21 | Semibold | Primary list text |
| Body | Manrope | 14/20 | Medium | Secondary text |
| Small | Manrope | 13/18 | Medium | Captions, subtext |
| Micro | Manrope | 11.5/14 | Bold | Tags, timestamps, nav labels |

**Spacing** — base unit 4px: 4, 8, 12, 16, 24, 32, 40, 48, 64. This already matches Tailwind's default spacing scale 1:1 (`spacing-1`=4px … `spacing-16`=64px), so no custom spacing tokens are needed — use Tailwind's default scale.

**Radius**: xs=8px, sm=12px, md=18px, lg=28px, full=9999px (pill — used for all buttons and the nav bar).

**Shadow**: the sheet shows 4 unlabeled elevation swatches (Sm/Md/Lg/Xl) on a warm-white ground with no numeric spec. **Assumption**: since no blur/spread values are printed, I will implement a conservative 4-step soft shadow scale tuned to read correctly against both the warm-white and Neutral-900 surfaces used elsewhere in the system:
- `--shadow-sm: 0 1px 2px rgba(13,17,23,0.10)`
- `--shadow-md: 0 4px 10px rgba(13,17,23,0.12)`
- `--shadow-lg: 0 8px 20px rgba(13,17,23,0.14)`
- `--shadow-xl: 0 16px 36px rgba(13,17,23,0.18)`
Per Principle 3 ("Quiet by default — no shadow on every row"), these should be used sparingly (e.g. the voice sheet / modals / hover-elevated cards), not as a default card treatment.

**Icons**: 24×24 grid, 1.6px stroke, outline-only (no filled state), rounded caps/joins. Reference shows mic, mail, calendar, file/note, plus, keyboard, send (arrow), chevron-right. `lucide-react` matches this style closely (outline, customizable `strokeWidth`) — will add as a dependency and set `strokeWidth={1.6}` via a shared icon default.

**Buttons** (height 44px, radius full, font Manrope Bold 13–14px), 4 variants × 3 states (Default/Hover/Disabled):
- Primary: filled Gold 400, dark (Neutral 900) bold text; hover → Gold 300; disabled → Gold 400 at reduced opacity with muted text.
- Secondary: transparent bg, Gold 400 border + Gold 400 text; hover → subtle gold-tinted fill; disabled → Neutral 500 border/text.
- Tertiary: filled Neutral 700, Warm-white text; hover → slightly lighter neutral fill; disabled → Neutral 800 fill, Neutral 500 text.
- Text: no bg/border, Teal 500 text; hover → underline; disabled → Neutral 500.

**Inputs**: Neutral 800 background, height 44px, radius 20px, 2px Gold focus outline. Two shown: free-text ("Ask Disala anything…" with trailing mic icon) and a select ("Most recent" with chevron).

**Badges/tags** (pill, Micro-ish bold text) — map 1:1 to Principle 2 ("Gold is action, teal is time, green is done"):
- "Needs reply" (Attention) → Gold tint bg / Gold text.
- "Replied" (Resolved) → Success tint bg / Success text.
- "Up next" (Schedule) → Teal tint bg / Teal text, outline.

**Status** (dot/icon + label): Listening = Gold dot, Speaking = Teal dot, Saved = Success check icon, Muted = Neutral-500 outline circle.

**Progress**: labeled bar, Neutral 700 track, Gold 400 fill, percentage right-aligned, helper text below in Neutral 300/500.

**Cards**: 4 content patterns on a Neutral 800 surface, radius md, no default shadow (Principle 3): Email card (avatar initials, timestamp, sender = Heading, subject = Body, preview = Small muted, status badge), Event card (time = Heading bold, "Up next" badge, title, attendees = Small muted, "Ask Disala" text-button), Note card (title, muted timestamp, preview text), Voice response card (status dot + Heading text + Small muted subtext).

**Navigation**: bottom nav bar, pill container, Neutral 800 bg, 4 flat tabs (Home/Mail/Calendar/Notes, icon+Micro label), active tab = Warm white, inactive = Neutral 500, unread-count badge (Gold circle with number) on an icon. Separately, a "Listening" state chip with a close (×) icon represents the voice sheet's only other nav element (not part of the tab bar).

## Architectural decisions

1. **Tailwind v4 CSS-first tokens.** Extend `app/globals.css`'s existing `@theme inline` block with the Disala palette, font families, radius scale, and shadow scale as CSS custom properties. No `tailwind.config.ts` is introduced (matches the project's existing v4 setup).
2. **Fonts via `next/font/google`** in `app/layout.tsx`, replacing Geist Sans/Mono (not used anywhere yet, safe to remove). Fraunces and Manrope are both available on Google Fonts.
3. **shadcn/ui scaffolding** for `Button`, `Input`, `Select`, and `Badge` (`npx shadcn@latest init`, then `add button input select badge`), then restyle their variants in place to match the tokens above, rather than hand-rolling class-variance-authority setup from scratch. This matches AGENTS.md §6's recommended stack and gives future page-implementation prompts a consistent primitive layer to build on.
4. **Custom composite components** (no shadcn equivalent) built directly with Tailwind classes on top of the primitives above, under `components/disala/`:
   - `StatusDot` (Listening/Speaking/Saved/Muted)
   - `ProgressBar`
   - `EmailCard`, `EventCard`, `NoteCard`, `VoiceResponseCard`
   - `BottomNav`
   - `VoiceStateChip`
5. **Icons**: add `lucide-react`. Icons are always rendered outline-only at `strokeWidth={1.6}` — enforced by a small `Icon` wrapper default rather than passing the prop at every call site.
6. **`/style-guide` route** (`app/style-guide/page.tsx`) renders every token swatch and component/state so the implementation can be visually compared side-by-side with `design/disala-design-system.png`. This route is a dev reference, not a product page — it is not linked from any nav and can be deleted later without affecting the app.

## Assumptions

- Shadow values are inferred (no numeric spec in the sheet) — flagged above, easy to tune later against the real Figma/Stitch source if one becomes available.
- Badge/status tint colors (e.g. "Gold tint bg") are implemented as the base color at low alpha (12–15%) since the sheet doesn't print separate tint hexes — only the 12 base swatches have explicit hex values.
- This prompt does not touch `app/page.tsx`'s content beyond what's needed to keep the app building (it stays as the default Next.js starter, or is not modified at all) — the real Home page is a separate prompt using `disala-01-home.png`.
- No backend/data/AI work is included — this is presentation-layer only, so none of AGENTS.md's approval/agent/security sections apply here (no consequential actions, no tool calls, no user data).

## Files expected to change

- `app/globals.css` — design tokens (`@theme inline` additions).
- `app/layout.tsx` — swap Geist → Fraunces/Manrope.
- `package.json` / `package-lock.json` — add `lucide-react`, shadcn/ui deps (`class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/*` as needed by the components added), `tailwindcss-animate` if the shadcn init pulls it in.
- New: `components.json` (shadcn config).
- New: `lib/utils.ts` (shadcn `cn` helper).
- New: `components/ui/button.tsx`, `input.tsx`, `select.tsx`, `badge.tsx` (shadcn-generated, restyled).
- New: `components/disala/status-dot.tsx`, `progress-bar.tsx`, `email-card.tsx`, `event-card.tsx`, `note-card.tsx`, `voice-response-card.tsx`, `bottom-nav.tsx`, `voice-state-chip.tsx`, `icon.tsx`.
- New: `app/style-guide/page.tsx`.

## Functional requirements

- Every color/type/spacing/radius value above is expressed as a token (CSS var or Tailwind utility), not a hardcoded one-off hex/px in component code, so later pages can consume the same system consistently.
- Button/Input/Badge components expose the variants described above via props (e.g. `variant="primary" | "secondary" | "tertiary" | "text"`), with hover/disabled states handled by CSS (`:hover`, `:disabled`), not JS state.
- `/style-guide` renders: full color palette with hex labels, both fonts at all 7 type-scale styles, the spacing scale, radius scale, shadow scale (on a warm-white swatch per the reference), all icons, all button variant×state combinations, both input types, badges, status list, progress bar, all 4 card types, and the bottom nav (with and without the unread badge) plus the voice state chip.

## Security considerations

None — no auth, no external data, no user input processed beyond static demo content on the style guide page.

## AI/agent behavior

None — this task contains no agent or tool-calling logic.

## Approval requirements

None — this is a non-consequential, purely local presentation-layer change (no data mutation, no external calls). Per AGENTS.md §7.3 this does not require a runtime approval flow; it does require the standard prompt-approval step below before implementation starts.

## Error handling

N/A (static UI).

## Acceptance criteria

- `npm run build` and `npm run lint` pass.
- `/style-guide` renders without console errors and visually matches `design/disala-design-system.png` for: colors, both fonts, type scale, spacing swatches, radius swatches, button variants/states, inputs, badges, status rows, progress bar, the 4 card types, and the bottom nav.
- No leftover references to Geist fonts.
- All new components are used at least once on `/style-guide` (no dead code).

## Automated checks

- `npm run lint`
- `npx tsc --noEmit` (type check)
- `npm run build` (production build)

## Manual test steps

1. `npm run dev`, open `/style-guide`.
2. Compare side-by-side with `design/disala-design-system.png`: colors, typography, spacing, radius/shadow, buttons (hover + disabled by inspecting classes / using keyboard focus / a disabled prop toggle), inputs (including focus ring), badges, status, progress, cards, nav.
3. Resize the browser down to a mobile width and confirm the style guide reflows without horizontal scroll (no mobile reference exists for this sheet, but per AGENTS.md §3 every page must still be responsive).
4. Toggle OS light/dark mode (if applicable) — the reference is a single dark-surface system, so confirm we are not accidentally inheriting the starter template's `prefers-color-scheme` light/dark swap in `globals.css` (it should be removed/superseded by the fixed Disala palette).

---

Is this good to execute?
