# Disala — Add PWA support (installable + basic offline fallback)

## Goal

Make Disala installable as a Progressive Web App (manifest, icons, "Add to Home Screen"/install prompts) with a basic offline fallback page, per the scope you chose: **installable + basic offline fallback**, not a full offline-capable app with runtime caching strategies. No new dependency, no change to how any page fetches or renders live data.

## Relevant skills

None specific — no PWA build-tool skill is installed in this project; this uses only Next.js's built-in file conventions (`app/manifest.ts`) and a hand-written service worker.

## Existing code inspected

- `package.json` — Next 16.3.4, React 19.2.8, Turbopack (Next 16's default bundler for both `dev` and `build`, no flags set). **No PWA package installed** (`next-pwa`, `@ducanh2912/next-pwa`, `serwist`/`@serwist/next`, `workbox-*` all absent).
- `next.config.ts` — empty/default, no existing config to reconcile.
- `app/layout.tsx` (full file) — `metadata` only has `title`/`description`; no `viewport` export exists at all (required separately from `metadata` since Next 14+ for `themeColor`); no `manifest`, `icons`, or `appleWebApp` fields.
- `public/` — only the default `next dev` starter SVGs plus `app/favicon.ico`. No manifest, no app icons of any size, no service worker, anywhere in the repo. Confirmed via repo-wide search: no `sw.js`, no `next-pwa.config.js`, no mention of PWA/manifest/serviceWorker/workbox in any `prompts/*.md` — this is new territory, not something a prior prompt deferred.
- `app/globals.css` — the app is **fixed dark-themed**, no light-mode toggle exists. Confirmed exact tokens to reuse: `--color-neutral-900: #0d1117` (page background), `--color-gold-400: #ecbb6b`, `--color-teal-400: #6fc5bc`, `--color-neutral-700` (avatar base) — the same values the icon and manifest colors below are built from, not new brand colors.
- `components/disala/app-header.tsx` (lines 8-9, 75-79) — the existing avatar badge is `AVATAR_GRADIENT`: a radial gold→teal gradient on `--color-neutral-700`, with the user's initial rendered in `font-display` (Fraunces), colored `text-neutral-900` for contrast against the light gradient. This is the app's own established "single-letter mark on a gold/teal gradient" identity — reused directly for the app icon rather than inventing new icon art (AGENTS.md §3: no unreferenced visual design).
- `proxy.ts` — `clerkMiddleware()` with no explicit `.protect()` calls; its matcher already excludes `.webmanifest` and other static extensions from Clerk's matching. Per-page `auth()` calls do the actual redirect-to-sign-in, confirmed almost every page (`/`, `/mail`, `/calendar`, `/notes`, `/approvals`, `/contacts`, `/settings/connections`) does this. Only `/sign-in`, `/sign-up`, and the Clerk webhook route are public today.
- **Feasibility spike (run and deleted, not committed):** confirmed `next/og`'s `ImageResponse` — shipped inside the `next` package itself, zero new dependency — can render arbitrary JSX (including a radial gradient + text, and a remotely-fetched Fraunces `.ttf` for the glyph) to a real PNG buffer from a plain one-off Node script, independent of Next's request/build pipeline. This is how the real icon PNGs below get generated.

## Architectural decisions

1. **No PWA library/plugin** (`next-pwa`, `@ducanh2912/next-pwa`, `serwist`). All of these generate/inject a service worker via a **webpack** compiler plugin; Next 16 defaults to **Turbopack** for both `dev` and `build` with no flag to opt back into webpack in this project. Depending on one risks the service worker silently not being generated at all under a Turbopack build, or forcing an unwanted webpack fallback for the whole app just to get a feature we've scoped down to "installable + basic offline fallback." A hand-written ~40-line `sw.js` fully covers that scope with zero bundler/dependency risk.
2. **Manifest via Next's `app/manifest.ts` file convention** (returns `MetadataRoute.Manifest`) — Next compiles this to `/manifest.webmanifest` and auto-injects the `<link rel="manifest">` tag itself; no manual metadata wiring needed beyond the file existing.
3. **Icons are real static PNGs, generated once via a throwaway script using `next/og`'s `ImageResponse`** (confirmed feasible above), committed to `public/icons/` — not generated at request time, not a new runtime dependency. Design: exactly the existing `AVATAR_GRADIENT` (gold-400/teal-400 radial gradient on neutral-700) with a centered "D" in Fraunces, neutral-900, matching the avatar's own contrast treatment. Sizes:
   - `icon-192.png`, `icon-512.png` — standard Android/Chrome manifest icons (`purpose: "any"`).
   - `icon-512-maskable.png` — same gradient fills the *entire* canvas edge-to-edge (no rounded corners baked in — the OS applies its own mask shape), the "D" scaled down to sit inside the ~80%-diameter safe-zone circle per the maskable icon spec, so it isn't clipped on circular/squircle home-screen masks.
   - `apple-touch-icon.png` (180×180) — iOS ignores web app manifests' icons and reads this specific file/meta tag separately.
   The generation script itself is not part of the app or its build — it's a dev-time tool, run once, deleted after, exactly like how `favicon.ico` is just a checked-in static file today with nothing generating it on every build.
4. **`app/layout.tsx` gains a `viewport` export and extends `metadata`** — `viewport: { themeColor: "#0d1117" }` (separate from `metadata` per Next 14+'s split), `metadata.appleWebApp = { capable: true, statusBarStyle: "black-translucent", title: "Disala" }`, `metadata.icons` pointing at the generated files (covers crawlers/browsers that read `<link>` tags directly, redundant with but not conflicting with the manifest).
5. **Service worker (`public/sw.js`) only precaches the manifest, the icon files, and `/offline` — nothing else.** Its fetch handler is network-first for navigations only, falling back to the cached `/offline` page solely when the network request fails; every other request (JS/CSS bundles, API routes, Google/DB-backed data) passes straight through untouched. Two reasons, both hard constraints given what this app actually is:
   - Almost every page is Clerk-auth-gated live data (Gmail, Calendar, Postgres). Caching or ever serving a stale version of that — even the page shell — risks showing wrong/outdated information as if it were current, which is the same "never claim success/present a guess as fact" principle AGENTS.md §7.5/§15 applies to data, extended here to not silently serving stale authenticated UI either.
   - Next's `_next/static/*` bundle filenames are content-hashed and change every build; hardcoding them into a static `sw.js` (impossible to keep in sync without the exact kind of bundler plugin decision 1 just avoided) would go stale immediately and either 404 on install or pin an old bundle forever.
6. **Registration is a tiny client component (`components/disala/register-service-worker.tsx`)**, mounted once in `app/layout.tsx`, guarded by `"serviceWorker" in navigator` and `process.env.NODE_ENV === "production"`. Skipping registration in `next dev` avoids the service worker interfering with Turbopack's dev-time hot reload/caching while iterating — this means manual testing below requires a production build (`next build && next start`), not `next dev`.
7. **`/offline` is a plain, static Server Component page** (`app/offline/page.tsx`) — no `auth()` call, no data fetching, since it must be fully renderable from the service worker's cache with zero network. Reuses existing typography/`Button` primitives; a "Try again" button just does `location.reload()`.
8. **No `proxy.ts` change.** Its matcher already excludes `.webmanifest`/static extensions from Clerk's matching, and `/offline` needs no exclusion either — `clerkMiddleware()` itself never redirects (each page's own `auth()` call does), and `/offline` doesn't call `auth()`, so it's public the same way `/style-guide` already is.

## Assumptions

- `theme_color`/`background_color` = `#0d1117` (neutral-900) — the app's only theme, no light mode exists to pick a second value for.
- Manifest `name`/`short_name`: `"Disala"` for both (short enough to never truncate under a home-screen icon). `start_url`/`scope`: `"/"` — the whole app, not a sub-path.
- `display: "standalone"` (hides browser chrome, matches an "installed personal assistant app" feel) — not `"fullscreen"` (would also hide the OS status bar, unrequested and risks clipping under some devices' safe areas) and not `"minimal-ui"` (keeps browser back/forward controls, undermining the installed-app feel).
- Service worker registers only in production builds (decision 6) — `npm run dev` behaves exactly as it does today, unaffected.
- No push notifications, background sync, or app badging — none were requested, each is its own feature with its own permission UX; flagged as possible future follow-ups, not silently bundled in or silently dropped.
- iOS Safari has well-known PWA gaps (no `beforeinstallprompt` event, limited background service-worker execution) — manifest + `apple-touch-icon` + the `appleWebApp` meta tags give the standard "Add to Home Screen" experience there; no iOS-specific workarounds beyond that baseline are attempted.
- Once first loaded online, a repeat offline visit shows `/offline` for any *navigation* the service worker intercepts — this is the standard service-worker precache caveat (a device that has never loaded the app once online has nothing cached yet to show).

## Files expected to change

New:
- `app/manifest.ts` — the `MetadataRoute.Manifest` export (name, icons, theme/background color, display, start_url/scope).
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-512-maskable.png`, `public/icons/apple-touch-icon.png` — generated once via a throwaway script (script itself not committed).
- `public/sw.js` — hand-written service worker (install/precache + navigation-fallback fetch handler per decision 5).
- `components/disala/register-service-worker.tsx` — client component, registers `sw.js` in production only.
- `app/offline/page.tsx` — static offline fallback page.

Modified:
- `app/layout.tsx` — add `viewport` export, extend `metadata` (`appleWebApp`, `icons`), mount `<RegisterServiceWorker />` in `<body>`.

Not touched: `next.config.ts`, `proxy.ts`, `package.json` (no new dependency), `prisma/schema.prisma`, every existing page/component other than `app/layout.tsx`.

## Functional requirements

- Chrome/Edge (desktop and Android), served over HTTPS or `localhost`, offer an install prompt for "Disala" using the gold/teal "D" icon once the manifest + active service worker are present.
- iOS Safari's "Add to Home Screen" shows the same name and the `apple-touch-icon`.
- The installed app opens in standalone mode (no browser address bar), landing on `/`, which redirects to `/sign-in` exactly as it does in the browser today — no change to auth behavior.
- With no network connection, reloading (or navigating to) any page the service worker has intercepted shows `/offline` instead of the browser's default offline error — after at least one prior successful online visit.
- `/offline` offers a working "Try again" action.
- No page's live data (mail, calendar, notes, approvals, contacts) is ever served from a stale cache — only the manifest, icons, and the static `/offline` page are cached at all.

## Security considerations

- The service worker caches only public, non-user-specific static assets (manifest, icons, the static `/offline` HTML) — never an API response or an authenticated page's HTML, so there's no risk of one user's cached data leaking to a different user on a shared device (a real risk with naive "cache everything" service workers, deliberately avoided here).
- The service worker's scope is `/`, but its fetch handler is a no-op passthrough for everything except a failed navigation — it does not intercept, inspect, or modify cookie-bearing or `Authorization`-bearing requests to Gmail/Calendar/the app's own API routes; they reach the network exactly as if no service worker were installed.
- No user input flows into `sw.js` or `app/manifest.ts` — nothing here is a new injection surface.

## AI/agent behavior

Not applicable — no agent tool, system prompt, or model-facing change.

## Approval requirements

Not applicable — no consequential/external action; this is client-side installability and static-asset caching only (AGENTS.md §7.3's "generally low-risk" category, if it applied at all here).

## Error handling

- Service worker registration is wrapped so a failure (e.g., an unsupported browser, or registration blocked) is caught and silently ignored — a missing PWA feature must never break the app for a browser that doesn't support it.
- If manifest/icons fail to load for any reason, browsers simply don't offer an install prompt — there is no in-app error state to design for.

## Acceptance criteria

- `npm run build && npm run start`; DevTools → Application → Manifest shows no errors, the correct name/colors/icons.
- DevTools → Application → Service Workers shows `sw.js` activated and controlling the page.
- After one successful online visit, DevTools → Network → "Offline", then reload → `/offline` renders (not a browser error page).
- Un-checking "Offline" and reloading returns the app to normal, live-data behavior on every page.
- Chrome offers an install option (desktop omnibox icon, or Android's install/"Add to Home screen" prompt) showing the correct name/icon.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

## Automated checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run build && npm run start` (service worker only registers in production — see decision 6).
2. Open in Chrome. DevTools → Application → Manifest — confirm name "Disala", theme/background color `#0d1117`, and all four icon sizes load correctly.
3. DevTools → Application → Service Workers — confirm `sw.js` shows as activated.
4. Sign in and browse a couple of pages so the shell/service worker has a chance to run once online.
5. DevTools → Network tab → check "Offline", then reload the page — confirm `/offline` renders instead of the browser's default "no internet" error.
6. Uncheck "Offline", reload — confirm the app returns to normal (sign-in / home / live mail/calendar/notes data, nothing stale).
7. On Chrome desktop, check the omnibox for an install icon (or `chrome://apps`); on Android Chrome, check for an "Install app"/"Add to Home screen" prompt — confirm the Disala name/icon appear correctly, and that opening the installed app launches in standalone mode.
8. On an iPhone (Safari), Share → "Add to Home Screen" — confirm the name and icon look correct on the home screen.
9. Confirm `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.

---

## Manual setup required before I can implement/test this

None — icon generation only needs one-time network access to fetch the Fraunces font file from Google Fonts during the throwaway generation script (already confirmed reachable); no new environment variable, credential, or account is needed. Full install-prompt/offline testing on a real mobile device is optional but recommended if you want to confirm the iOS/Android home-screen experience yourself.

---

Is this good to execute?
