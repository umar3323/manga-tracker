# YOMU Site Audit — 2026-06-11

## Audit Summary

This audit covers 20+ features across Library, Tracking, Discovery, Stats, Notifications, Social, and Settings. Files reviewed include all major components (LibraryCard, DetailView, LibraryModals, LibraryFilters, DiscoverPanel, DiscoverySection, ReleaseCalendar, SessionTimer, DuplicateDetector, NotificationBell, FeatureRequestModal), all API routes documented in CLAUDE.md, the PWA manifest, service worker, and middleware. A total of **38 issues** were identified: **3 Critical**, **7 High**, **16 Medium**, and **12 Low**. Three additional issues are pre-known (noted below). The codebase is generally well-structured post-refactor; the most systemic concerns are missing focus traps in all modals, the manifest lacking raster PWA icons for install prompts, and multiple components relying on unguarded client-side fetches without error states.

---

## Known Issues (Pre-Diagnosed — Not Re-Audited)

| Issue | Status |
|---|---|
| Feature request button — corrupted env var | KNOWN — broken for all users |
| Chapter alert cron — blocked by auth middleware, never fired | KNOWN — broken for all users |
| Duplicate detection dismissal — `user_settings` table missing, state doesn't persist | KNOWN — data loss on reload |

---

## Feature Status Table

| Feature | Status | UX Issues | A11y Issues | Mobile/PWA Issues | Risk Flags |
|---|---|---|---|---|---|
| Home / Continue Reading strip | Working | No dedicated "continue reading" strip — library card grid serves this role | — | IntersectionObserver sentinel works on mobile | — |
| Library card (manga & anime) | Working | Status dropdown hidden behind `has_anime` condition; delete button is `×` char not icon | Progress bars missing aria-label; `×` delete has aria-label but `PenLine` notes button has none | Touch targets on −/+ buttons use `@media(pointer:coarse)` correctly | Inline Supabase write in rating handlers (no error boundary) |
| Detail view modal | Working | 8 parallel API loads; slow network can leave many spinners; no retry button | No `role="dialog"`, no `aria-modal`, no focus trap, no focus restore on close | Panel slides in; no `safe-area-inset` padding on bottom edge | 2,046-line file; AniList fetched directly from browser (no proxy) |
| Add to library flow | Working | Suggestion dropdown loses state if user clicks away; no dupe warning before add | Add-bar input has no `<label>` element (only placeholder) | Works on mobile | — |
| Status filters | Working | `text-zinc-700` count badges on inactive pills — very low contrast | `aria-pressed` correct on status tabs; type-filter pills have no `aria-pressed` | Horizontal scroll on mobile works | — |
| Shelves | Working | N+1 query pattern: one Supabase call per shelf on load | Shelf name input has no `<label>` | — | No error state if shelf fetch fails |
| Duplicate detection | Partial | Dismissal appears to save but reappears on reload (known: missing `user_settings` table) | — | — | O(n²) similarity scan runs on every `manga` change via `useMemo` with `checked` dep |
| Manual progress update | Working | −/+ buttons only fire `onChapterUpdate`; watch prompt input missing `<label>` | Watch prompt input missing `aria-label` | 44px touch targets on coarse pointer ✓ | — |
| Session timer | Working | Fixed bottom position overlaps mobile nav; minimised button at `bottom-24` | Minimised timer button has no `aria-label` | Fixed element not safe-area-aware | — |
| Date attribution modal | Working | "Apply To All" checkbox state stored in React only — lost on navigation | Modal has no `role="dialog"` or `aria-modal` | — | — |
| Rewatch / Reread counter | Working | Functional | — | — | — |
| Discover / Swipe | Working | Mouse drag and touch drag both implemented | Swipe cards have no keyboard alternative (arrow keys not bound) | Touch events correct | Queue re-fetches on every page mount with no cache |
| Similar titles | Working | Shown in DetailView relations section | — | — | AniList GraphQL called directly from browser (not proxied) |
| New / Updated / Popular | Working | Hourly cache correct | — | Images use `fill` without `sizes` prop | — |
| Stats page | Working | Heavy page (1,707 lines) but useMemo applied to heavy sections | No aria-labels on heatmap cells | Heatmap overflows on narrow screens | DuplicateDetector rendered here in addition to page.tsx (double scan) |
| Chapter alerts (push) | Broken | Subscription UI works; cron never fires (KNOWN) | Bell button has no `aria-live` region for state changes | — | VAPID key injected from `process.env` with `!` non-null assertion — crashes if missing |
| Release calendar | Working | AniList detail panel fetched directly from browser (not proxied) | Calendar rows are `<button>` (correct); day strip has no `aria-label` | Day strip scroll-snap works on mobile | — |
| Share link | Working | Share URL construction depends on `NEXT_PUBLIC_SITE_URL` — no fallback to `window.location.origin` | ShareModal has no `role="dialog"` | — | — |
| Community totals | Working | GET endpoint uses anon key (unauthenticated reads allowed by design) | — | — | No rate limiting on POST — any authenticated user can overwrite any `mal_id` |
| Auth flow | Working | Redirect to `/login` on any unauthenticated request | — | — | `proxy.ts` uses `!` on both Supabase env vars — silent crash if missing |
| Extension pairing | Working | Static page — no auth required to view | — | — | — |
| Feature request | Broken | Env var corrupted (KNOWN) | FeatureRequestModal has no `role="dialog"` or `aria-modal` | — | — |

---

## Critical Issues

**Chapter Alerts Cron** — The `/api/cron/` routes are exempt from middleware auth but the chapter-check cron that _sends_ push notifications is blocked by auth middleware and has never fired. Users who subscribed to chapter alerts receive no notifications. File: `proxy.ts` lines 37–40 (cron exempt pattern); cron route path needs verification.

**Feature Request Button** — Corrupted environment variable causes the `/api/feature-request` endpoint to fail for all users. The UI modal opens and submits but all requests return an error. File: `components/FeatureRequestModal.tsx` line 24, `app/api/feature-request/route.ts`.

**Duplicate Dismissal Data Loss** — `DuplicateDetector` reads dismissed pairs from `user_settings` table on mount but the table does not exist in the production DB schema. Every dismissed pair reappears on reload. File: `components/DuplicateDetector.tsx` lines 41–48.

---

## High Issues

**[All Modals] No focus trap or focus restore** — Every modal in the app (AuthorModal, StudioModal, RecommendationModal, ShareModal, TakeoutImportModal, HealthCheckModal, FeatureRequestModal, DateAttributionModal) has no focus trap implementation. Focus leaks to background content when a modal is open, and focus is not restored to the trigger element on close. This is a WCAG 2.1 AA failure (2.4.3 Focus Order, 2.1.2 No Keyboard Trap). Files: `components/LibraryModals.tsx`, `components/FeatureRequestModal.tsx`, `components/DateAttributionModal.tsx`.

**[All Modals] Missing role="dialog" and aria-modal** — None of the app's modals declare `role="dialog"` or `aria-modal="true"`. Screen readers will not announce modal context and will continue reading background content. Files: `components/LibraryModals.tsx` (9 modals), `components/FeatureRequestModal.tsx`, `components/DetailView.tsx` (DetailModal).

**[PWA] No raster icons at 192px or 512px** — `public/manifest.json` only declares SVG icons. Chrome and Android require PNG icons at 192×192 and 512×512 for PWA install prompts and splash screens. Without these, the app cannot be installed as a PWA on Android and the install banner will not appear. File: `public/manifest.json` lines 13–17.

**[Discover / Swipe] No keyboard alternative for swipe** — The swipe discovery card handles `onMouseDown`, `onTouchStart/Move/End` but has no keyboard handler. Keyboard-only users and screen reader users cannot interact with the swipe queue. File: `components/DiscoverPanel.tsx` lines 317–323.

**[DetailView] AniList GraphQL called directly from browser** — `ReleaseCalendar.tsx` (line 88) and `DetailView.tsx` make direct `fetch('https://graphql.anilist.co', ...)` calls from the browser. AniList applies rate limits per IP; browser calls expose the client IP and bypass the server-side 24h DB cache, meaning every user independently hits the AniList rate limit. File: `components/ReleaseCalendar.tsx` line 88.

**[Stats] DuplicateDetector rendered twice** — `DuplicateDetector` is rendered in both `app/page.tsx` and `app/stats/page.tsx`, each running an O(n²) title similarity scan on the full manga list. On large libraries this can lock the UI thread. File: `app/stats/page.tsx` (DuplicateDetector import at line 11).

**[Session Timer] Fixed position overlaps mobile nav without safe-area padding** — `SessionTimer` minimised button uses `bottom-24 lg:bottom-6` which aligns to the 6rem nav bar height, but does not account for `env(safe-area-inset-bottom)` on notched phones. The timer can be hidden behind the system home bar. File: `components/SessionTimer.tsx` line 80.

---

## Medium Issues

**[LibraryFilters] Type-filter pills missing aria-pressed** — Status filter tabs correctly use `aria-pressed` but the type-filter pills (Manga, Manhwa, Webtoon, etc.) above them do not. Screen readers cannot determine which type is active. File: `components/LibraryFilters.tsx` line 73.

**[LibraryCard] Notes button (PenLine) has no aria-label** — The pen icon button that toggles the notes field has no `aria-label` or `title` attribute. File: `components/LibraryCard.tsx` line 306.

**[LibraryCard] Delete button uses `×` text character** — The delete button uses a raw `×` text character rather than an icon component. It does have `aria-label` but the tap target is very small (`text-lg leading-none`). File: `components/LibraryCard.tsx` line 331.

**[Add Form] No duplicate warning before insertion** — When adding a title that already exists in the library, the flow proceeds until a Supabase unique-constraint error (code `23505`) is surfaced. No pre-check warns the user before submission, causing a failed request that wastes an API round-trip. File: `app/page.tsx` (add flow, ~line 400).

**[Shelves] N+1 query pattern** — `app/shelves/page.tsx` issues one Supabase query per shelf to fetch manga items, inside a `Promise.all`. For a user with many shelves this generates N+1 DB round-trips. File: `app/shelves/page.tsx` lines 22–35.

**[DiscoverySection] Images missing sizes prop** — Cover images in `DiscoverySection` and `DiscoverPanel` use `fill` layout without the `sizes` attribute. Next.js will serve a full-resolution image at every breakpoint, increasing LCP on mobile. Files: `components/DiscoverySection.tsx`, `components/DiscoverPanel.tsx` (DiscoveryGrid, line 74).

**[Community Totals] No rate limiting** — The POST endpoint allows any authenticated user to overwrite community chapter/episode totals for any `mal_id` with no rate limiting or validation bounds check. A user could set totals to 0 or extreme values affecting all users who rely on community data. File: `app/api/community-totals/route.ts`.

**[Share Modal] No fallback for NEXT_PUBLIC_SITE_URL** — The share URL is built from `NEXT_PUBLIC_SITE_URL`. If this env var is missing the share link will be malformed. A fallback to `window.location.origin` would make this robust. File: `components/LibraryModals.tsx` (ShareModal).

**[DateAttributionModal] Session state not persisted** — "Apply To All" session checkbox is React component state only. Navigating away and returning resets it. File: `components/DateAttributionModal.tsx`.

**[NotificationBell] No aria-live region** — When the bell's state changes (subscribed → unsubscribed), there is no `aria-live` announcement. Screen readers will not inform users that the subscription state changed. File: `components/NotificationBell.tsx` lines 74–80.

**[Stats page] Heatmap overflows on narrow screens** — The `ReadingHeatmap` renders a 53-column grid in a scrollable container but does not set `overflow-x: auto` explicitly on the heatmap wrapper itself, which may clip on some browsers. File: `app/stats/page.tsx` (~line 98).

**[DetailView] 2,046-line file** — Even after the refactor, `DetailView.tsx` remains at 2,046 lines. It mixes `EditableNumber`, `RelationMergeButton`, `SeriesPanel`, and `DetailModal` in a single file. Future maintenance will be error-prone. File: `components/DetailView.tsx`.

**[Add bar] Input missing <label>** — The "add title" search input uses only a `placeholder` attribute with no associated `<label>` element, which fails WCAG 1.3.1 (Info and Relationships). File: `app/page.tsx` (~line 700, add-bar input).

**[Shelves] Create shelf input missing <label>** — The new-shelf name input similarly relies on placeholder only. File: `app/shelves/page.tsx` line 80.

**[Watch prompt input] Missing aria-label** — The inline "How Many Episodes Have You Watched?" input inside LibraryCard has no `aria-label`. File: `components/LibraryCard.tsx` line 534.

---

## Low Issues

**[LibraryCard] STATUS_LABELS duplicated** — `STATUS_LABELS` is defined identically in at least 5 files (`app/page.tsx`, `components/LibraryCard.tsx`, `components/LibraryFilters.tsx`, `components/LibraryModals.tsx`, `components/DiscoverPanel.tsx`). A single export from `lib/supabase.ts` or a shared constants file would prevent future divergence.

**[DiscoverySection] Hourly cache uses module-level ref** — Cache refs are module-level and survive hot-reload but not a hard refresh. If a user refreshes mid-hour, the cache is cleared unnecessarily. This is minor UX; not a bug.

**[ReleaseCalendar] Day strip aria-label missing** — The scrollable day strip has no `aria-label` or `role="group"` to announce its purpose to screen readers. File: `components/ReleaseCalendar.tsx`.

**[TrendingSection] eslint-disable on deps** — `TrendingSection.tsx` line 76 suppresses `react-hooks/exhaustive-deps`. The missing dep should be audited to confirm it is intentional, not a latent stale-closure bug.

**[app/page.tsx] Two eslint-disable-next-line exhaustive-deps** — Lines 163 and 1235 suppress missing deps warnings. Both should be reviewed: line 163 is the dismissed-pairs effect (intentional mount-only), line 1235 needs inspection to confirm it is safe.

**[anime-check API] console.log in hot path** — `app/api/anime-check/route.ts` line 58 logs every cold-start title load to the Vercel function logs. This is verbose and could obscure real errors. File: `app/api/anime-check/route.ts`.

**[manifest.json] No 512px PNG icon** — Related to the High PWA issue above; noted separately as the maskable icon is SVG-only, which does not satisfy the maskable icon requirement for Android adaptive icons.

**[proxy.ts] Hard ! assertions on env vars** — `proxy.ts` uses `!` on `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A missing env in a new deployment will throw a runtime error on every request rather than a clear startup error. File: `proxy.ts` lines 6–7.

**[NotificationBell] Push subscribe endpoint path** — Subscribe/unsubscribe calls `/api/push/subscribe` but the API directory contains only an `app/api/push/subscribe/` folder. The route file path needs to be confirmed to exist as a Next.js route handler.

**[LibraryCard] Inline SVG thumbs icons** — ThumbsUp/ThumbsDown use raw inline SVG paths rather than importing the Lucide icons already used elsewhere in the file. This inflates the component and is inconsistent. File: `components/LibraryCard.tsx` lines 498–515.

**[app/page.tsx] 2,102 lines** — After the refactor the main page file is still 2,102 lines. Consider extracting the add-to-library flow into a dedicated `AddEntryModal` component.

**[DiscoverPanel] Swipe queue fetched on every mount** — The swipe queue calls `/api/swipe-queue` with no local caching. Every time the user navigates away and back, the Jaccard scoring re-runs on the server. A short-lived session cache (e.g. `sessionStorage`) would reduce load.

---

## Accessibility Summary

The most systemic accessibility failures are: (1) **all modals lack `role="dialog"`, `aria-modal`, focus traps, and focus restore** — this affects every modal in the app and represents the single highest-effort, highest-impact a11y fix; (2) **interactive elements without labels** — notes toggle button, session timer minimised button, watch prompt input, and filter pills all lack accessible names; (3) **low-contrast text** — `text-zinc-700` badges (count pills on inactive filter tabs) and `text-zinc-600`/`text-zinc-500` secondary text throughout cards render below WCAG AA contrast on the `#0d0d0d` background. The top three patterns to fix: add a shared `<Modal>` wrapper with focus trap and `role="dialog"`; add `aria-label` to all icon-only buttons; replace `text-zinc-700` with `text-zinc-500` minimum for informational text.

---

## Mobile & PWA Summary

The manifest is close to install-ready but is **missing raster PNG icons at 192×192 and 512×512**, which are required for Android PWA install prompts and splash screens. The SVG maskable icon is non-standard for this purpose. The service worker (`public/sw.js`) is present and correctly implements network-first with offline fallback and handles Web Push — the offline story is solid for static assets. The most impactful mobile fix is adding a `sizes` attribute to `<Image fill>` usages in `DiscoverySection` and `DiscoverPanel` (this directly improves LCP on mobile). The session timer's fixed bottom button should also use `padding-bottom: env(safe-area-inset-bottom)` to avoid the home-bar notch.

---

## Future Risk Summary

The top three architectural patterns most likely to cause problems: (1) **Direct AniList GraphQL calls from the browser** — `ReleaseCalendar` and `DetailView` bypass the server-side cache and hit AniList rate limits per user IP; as the user base grows this will surface as sporadic 429 errors in the detail panel and calendar. All AniList calls should be routed through the existing `/api/anilist` proxy. (2) **No shared modal wrapper** — all 9+ modals are implemented with raw `div` overlays. Any future modal will repeat the same pattern without focus trapping or ARIA roles; a shared `<Modal>` component would enforce correct behaviour by default and prevent regression. (3) **O(n²) DuplicateDetector rendered in two places** — on large libraries (200+ entries) the quadratic title comparison runs twice per page load; this will degrade performance proportionally with library size and should be centralised into a single call with a results cache.

---

## Recommended Fix Order

1. **Add PNG icons to manifest** — Add `icon-192.png` and `icon-512.png` (maskable variant) to `public/` and update `manifest.json` — effort **S**, unblocks PWA install for all Android users.
2. **Create shared Modal component with focus trap** — Extract a `<Modal>` wrapper that sets `role="dialog"`, `aria-modal`, traps Tab/Shift+Tab, and restores focus on close; migrate all 9+ modals — effort **L**, fixes the largest block of a11y issues at once.
3. **Fix corrupted Feature Request env var** — Identify and correct the broken env var in Vercel project settings — effort **S**, restores a feature broken for all users.
4. **Verify and fix chapter alert cron route** — Confirm the cron route path, ensure it's reachable, and test an end-to-end push notification — effort **M**, restores a feature broken since launch.
5. **Add `user_settings` table to DB** — Run the DDL already present in `migrations.sql`; confirm `user_settings` is created so duplicate dismissal persists — effort **S**, fixes data loss on reload.
6. **Proxy AniList calls through /api/anilist** — Move `fetch('https://graphql.anilist.co')` in `ReleaseCalendar.tsx` and any direct AniList calls in `DetailView.tsx` through the existing server proxy — effort **M**, prevents rate-limit failures at scale.
7. **Add 512px raster maskable icon** — Required companion to item 1; Android adaptive icons need a PNG maskable source — effort **S**.
8. **Add aria-pressed to type-filter pills** — One-line change in `LibraryFilters.tsx` — effort **S**.
9. **Add aria-label to PenLine notes button and session timer minimised button** — Two one-line changes — effort **S**.
10. **Add \<label\> to add-bar input, shelf name input, watch prompt input** — Replace placeholder-only inputs with visually-hidden `<label>` elements — effort **S**.
11. **Add sizes prop to Image fill usages** — Add `sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 16vw"` to discovery grid images — effort **S**, improves mobile LCP.
12. **Fix session timer safe-area padding** — Change `bottom-24 lg:bottom-6` to also apply `pb-[env(safe-area-inset-bottom)]` — effort **S**.
13. **Centralise DuplicateDetector to one render site** — Remove the second `DuplicateDetector` from `app/stats/page.tsx`; pass results via context or props — effort **S**.
14. **Rate-limit community totals POST** — Add a basic throttle (e.g. one write per `mal_id` per user per hour) and bounds validation on `total_chapters`/`total_episodes` — effort **M**.
15. **Break up DetailView.tsx** — Extract `SeriesPanel` and `RelationMergeButton` into separate files; target file under 800 lines — effort **M**, improves long-term maintainability.
