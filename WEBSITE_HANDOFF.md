# Website Handoff

## Project Overview

YOMU is a personal anime/manga tracking web app built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, and Supabase (Postgres + auth). Live at `manga-tracker-hazel.vercel.app`. All core features are active: library tracking, series grouping, discovery, airing calendar, sync, stats, sharing, Chrome extension for watch tracking, and community totals crowd-sourcing. This session fixed all 5 Chrome extension bugs identified by research: watch-time inflation, dedup over-suppression, non-anime tracking gate, stale popup stats, and slow UI refresh after a watch event. Also added `/api/library-titles` route, wired extension-facing API routes into the proxy middleware exemption list, and expanded achievements to 38 badges.

---

## Current State

### Latest Changes

#### Session 48 — iOS apple-touch-icon, Saiki K content_type fix, stats improvements — 2026-06-11, commits `1bdd599` `9f76201` `0790617` `5da066b`

**iOS apple-touch-icon**
- `public/apple-touch-icon.png` *(new)* — 180×180 PNG generated from `public/icon.svg` using sharp. iOS "Add to Home Screen" now uses the PNG for crisp, correctly cropped rendering.
- `public/manifest.json` — PNG added as first `icons` entry (`"sizes": "180x180", "purpose": "any"`). SVG entries retained as fallback.
- `app/layout.tsx` — `icons.apple` updated from `'/icon.svg'` → `'/apple-touch-icon.png'`.

**Saiki K content_type DB fix**
- Production DB — `manga_list` row `bc28abaa-d953-408e-bc2a-858ccdd77277` (`Saiki Kusuo no Ψ-nan`) updated: `content_type = 'anime'`, `has_anime = true`. Was incorrectly tagged as `'manga'`.

**Stats: Sync button on Session Log**
- `app/stats/page.tsx` — Added `sessionsRefreshing` state + `refreshSessions` callback (re-queries `watch_sessions` top-500). Session Log header changed from `<h3>` alone to a flex row with `<h3>` + Sync button (rotating SVG icon, "Syncing…" text while loading). Allows user to pull latest sessions without full page reload.

**Stats: manual episode updates → watch_sessions**
- `app/page.tsx` `commitEpisodeProgress` — Now inserts one `watch_sessions` row per episode advanced (`is_complete: true, site: 'manual'`) so Stats heatmap, Session Log, and Watch DNA all reflect manual card updates, not just extension-tracked events. Uses `useLibraryStore.getState().mangaList` for the entry title; logs insert errors via `console.error`.

**Stats: heatmap hover tooltips**
- `app/stats/page.tsx` `WatchHeatmap` — Replaced native `title=` attribute with a floating React tooltip. Tracks `tooltip: { date, count, titles[], x, y } | null` state. On `onMouseEnter` of a non-empty cell, builds a deduplicated title list from `daySessionsMap`. Renders a `fixed z-50 pointer-events-none` div at cursor coordinates showing: formatted date, episode count (cyan), bullet list of anime titles (up to 5 + "+N more"). Clears on `onMouseLeave` of the container.

---

#### Session 47 — watch_sessions inserts silently failing (idempotency_key NOT NULL, no default) — 2026-06-11, commit `a1ef046`

- `app/api/watch-event/route.ts` — Added error logging to the `watch_sessions` insert: result now captured in `{ error: sessionErr }` and logged via `console.error` on failure. Also added a comment explaining that the DB default (`gen_random_uuid()`) handles the idempotency_key; single-event inserts don't need client-supplied keys.
- `scripts/migrations.sql` — Added `ALTER TABLE watch_sessions ALTER COLUMN idempotency_key SET DEFAULT gen_random_uuid();` immediately after the NOT NULL line so schema recreations produce a working table.
- **DB (production):** Applied `ALTER TABLE watch_sessions ALTER COLUMN idempotency_key SET DEFAULT gen_random_uuid()` directly via Supabase MCP. Takes effect immediately for all future inserts.

---

#### Session 46 — 5 Chrome extension bug fixes + /api/library-titles + achievements (2026-06-10, commit `0e3687c`)

**Bug (a): watch-time inflation fixed**
- `extension/background.js` `updateSessionStats` — was calling `Math.round(30/60) = 1` per heartbeat, producing 2× over-counting. Now accumulates `delta/60` (fractional float) into `total_watch_minutes`. `Math.round` moved to display time only (in `popup.js` `fmtTime` which already takes an integer).

**Bug (b): dedup window too long**
- `extension/background.js` `isDuplicate()` — was using a single 300 s window for all events. 30 s heartbeats were suppressed (only 1 in 10 registered). Fixed: 10 s window for progress pings, 300 s for `is_complete` events. 6/10 heartbeats now reach the API.

**Bug (c): non-anime tracking gate**
- `extension/background.js` — added `fetchLibraryTitles()` (calls `/api/library-titles`, stores normalised title array in `chrome.storage.local` as `yomu_library_titles`), `normaliseTitle()`, `matchesLibraryTitle()`. Called alongside `fetchCustomSites()` on every auth event. `handleEvent` now gates streaming-platform tracking: if title not in library, event is dropped immediately (no API call).
- `app/api/library-titles/route.ts` *(new)* — GET endpoint; Bearer-token + cookie auth. Returns `{ titles: string[] }` — all `title` + `anime_title` values from `manga_list` for the authed user. `Cache-Control: private, max-age=300`.

**Bug (d): stale popup stats**
- `extension/popup.js` — extracted `renderStats()` and `renderLastTracked()` helpers. Added `chrome.storage.onChanged` listener that calls them whenever `yomu_session_stats` or `yomu_last_tracked` changes in `chrome.storage.local`. Popup now updates live while open without close + reopen. Also fixed `fmtTime` call to use `Math.round(stats.total_watch_minutes)` — was passing raw float from bug-(a) fix.

**Bug (e): slow UI refresh after watch event**
- `extension/background.js` `sendToAPI` — after `data.action === 'updated' || 'created'`, calls `notifyYomuTabs()`. That function queries for open YOMU tabs and sends `{ type: 'YOMU_REFRESH_LIBRARY' }` via `chrome.tabs.sendMessage`.
- `extension/background.js` injected YOMU-page content script (inline in `executeScript`) — added `chrome.runtime.onMessage` listener that relays `YOMU_REFRESH_LIBRARY` as `window.dispatchEvent(new CustomEvent('yomu:watch-event'))`.
- `app/page.tsx` — added `useEffect` listening for `'yomu:watch-event'` CustomEvent; calls `fetchManga()` immediately on receipt. Co-exists with the existing 60 s `setInterval` (fallback).

**Proxy middleware**
- `proxy.ts` — added `/api/streaming-sites`, `/api/library-titles`, `/api/watch-event`, `/api/watch-event/*` to `isPublicApi` exemption. These routes authenticate via Bearer token inside the handler; without this exemption the middleware redirected cookie-less extension requests to `/login` before the handler ran.

**Achievements expansion**
- `lib/achievements.ts` — expanded from 22 to 38 badges. New categories: Genre (Sports Fan, Mind Games, Comic Relief), Content-type (Anime Tracker, Manhwa Fan, Webtoon Reader, Cinephile, Omnivore), Score (Connoisseur — ≥8 score on 10+ titles), Count (Volume Eater 2,500ch, Endless Reader 10,000ch, Collector 50, Archivist 250), Milestone (Well Rounded, Saga Collector, Serial Finisher, Prolific Critic).

**MAL/AniList exports fixed**
- `app/page.tsx` `exportMALXML` — now produces two separate XML downloads (manga + anime). Anime uses `<anime>` element with `my_watched_episodes`. `scoreOf()` helper prefers numeric `m.score`; falls back to thumbs mapping. `finishDate()` returns ISO date for completed entries with dates, else `0000-00-00`.
- `app/page.tsx` `exportAniListJSON` — separate `manga` + `anime` sections; anime uses `episodes_watched` + `anime_mal_id`; `unwatched` mapped to `PLANNING`.

**swipe_history DB fixes**
- `scripts/migrations.sql` — added `user_id uuid` column to `swipe_history` + index + RLS policies (SELECT and INSERT scoped to `auth.uid()`). Updated `swipe_history_direction_check` constraint to include `'skip'` (was only `'right'|'left'`; code uses `'skip'` for dismissed cards → every dismiss was a DB constraint violation).

---

#### Session 45 — Install page, Gemini enrichment, stale index cleanup (2026-06-10)

**Install page**
- `app/install/page.tsx` — New public page at `/install`. Covers: "What You Get" checklist, 4-step iOS Safari guide, 4-step Android Chrome guide, desktop Chrome/Edge section, and a troubleshooting FAQ (4 entries). No auth required.
- `proxy.ts` — `/install` added to public route exemptions (`isPublicPage`) so unauthenticated users can reach it.
- `app/login/page.tsx` — "On your phone? Add YOMU to your home screen" link added below the login form, linking to `/install`.
- `app/extension/page.tsx` — "Using YOMU on your phone?" nudge card added at the bottom, linking to `/install`.

**Gemini Deep Search enrichment**
- `lib/gemini.ts` — New helper. Calls `gemini-2.0-flash` REST API (no new npm dependency). Gated on `GEMINI_API_KEY` env var. Returns `{ synopsis, themes[], trivia }`. 8s timeout. Falls back to empty result silently if key is absent or request fails.
- `app/api/deep-search/route.ts` — `enrichWithGemini()` runs in parallel with Claude arc detection. `content_type` accepted from request body. `DeepSearchResult` extended with `synopsis`, `themes`, `trivia`.
- `components/DeepSearchModal.tsx` — Shows Gemini synopsis (with "Save to entry" checkbox, auto-checked when present), themes as violet pills, trivia in italic block. Passes `content_type` in POST body. `handleSave` writes `synopsis` to `manga_list` when checkbox is checked.
- `app/page.tsx` — `content_type={deepSearchTarget.content_type}` passed to `<DeepSearchModal>`.
- `CLAUDE.md` — `GEMINI_API_KEY` added to env vars table.

**Infra cleanup**
- `.git/index 2`, `.git/index 3`, `.git/index 4` — Deleted (iCloud sync duplicates).
- `.next/types/routes.d 2.ts`, `.next/types/cache-life.d 2.ts`, `.next/types/validator 2.ts` and duplicate server/static/build dirs — Deleted. TS errors from app code: 0. Remaining TS noise is exclusively from `.next/types/ * 2.*` files that iCloud recreates each dev-server run — permanent fix requires moving repo out of synced folder.

**Sources page**
- `app/sources/page.tsx` — menome.in.th status changed from `in_progress` → `declined`; description updated to reflect no public API.

---

#### Session 44 — PWA / mobile access: icon, manifest, title fixes (2026-06-10)

- `public/icon.svg` — Created branded YOMU app icon (was missing entirely; browser was using a page screenshot as the home-screen icon). Dark `#0d0d0d` background, red `#FF2D46` "Y" lettermark, "YOMU" wordmark in white beneath. Designed within the maskable safe-zone (content in centre 80%).
- `public/manifest.json` — Expanded: added `scope`, `lang: "en"`, `categories: ["entertainment", "lifestyle"]`, split the single icon entry into two (purpose `"any"` + purpose `"maskable"` separately), added `shortcuts` array (Library `/`, Search `/search`, Stats `/stats`). Name updated to `"YOMU — Anime & Manga Tracker"`.
- `app/layout.tsx` — Fixed `metadata.title` (`'Manga Tracker'` → `'YOMU'`) and `appleWebApp.title` (`'Manga'` → `'YOMU'`). iOS "Add to Home Screen" and browser tab titles now show "YOMU".

---

#### Session 43 — Extension auto-reconnect + live library refresh (2026-06-10)

- `extension/background.js` — Extracted `harvestTokenFromTab(tabId)` helper (cookie + localStorage JWT harvest) from the inline code in `tabs.onUpdated`. Added `tryRefreshToken()`: queries for open YOMU tabs, calls `harvestTokenFromTab`, and if a fresh token is found calls `setAuthToken` + `flushPending` + `fetchCustomSites` silently. On API 401 in `sendToAPI`: replaced `setAuthToken(null)` with `tryRefreshToken()` — extension now auto-reconnects when the JWT expires instead of staying permanently disconnected. Same fix applied to the 401 branch in `flushPending`. The token is only cleared if no YOMU tab is open to harvest from (implicit — `tryRefreshToken` is a no-op if no tab found, the old token is left until the next successful harvest).
- `app/page.tsx` — Added a 60-second `setInterval` (alongside the existing `visibilitychange` listener) that calls `fetchManga()` whenever `document.visibilityState === 'visible'`. Handles the case where YOMU is already in the foreground while the extension logs an episode — `visibilitychange` never fires in that scenario. At most one extra Supabase read per minute while the tab is open.

---

#### Session 42 — Phase 2b: DetailModal open/close migrated to Zustand store (2026-06-10)

- `app/page.tsx` — Removed `selectedManga` local `useState`. Added `closeDetail` + `activeDetailId` to the store destructure. `selectedManga` is now a derived selector: `useLibraryStore(s => s.mangaList.find(m => m.id === s.activeDetailId) ?? null)`. All `setSelectedManga(m)` calls replaced with `openDetailStore(m.id)`; `setSelectedManga(null)` replaced with `closeDetail()`. Removed redundant `setSelectedManga` patch calls from `commitChapterProgress`, `commitEpisodeProgress`, `syncEntry`, and all DetailModal reset/restore/update callbacks — `patchEntry`/`setManga` already write to the store, so the derived `selectedManga` reflects changes automatically. `commitChapterProgress` and `commitEpisodeProgress` `useCallback` dep arrays cleaned up (removed `setSelectedManga`). QuickPeekSheet `onOpenDetail` simplified from a closure to `openDetailStore` directly. TypeScript passes clean.

---

#### Session 41 — Stats page IIFEs converted to useMemo (2026-06-10)

- `app/stats/page.tsx` — Converted all 5 remaining inline IIFEs to `useMemo` constants placed before the early return, following the same pattern as `animeStatsSection` and `readingVelocitySection`. Sections: `watchHistorySection` (deps: `watchSessions, manga, showAllSessions`), `watchDnaSection` (deps: `watchSessions, manga`), `ratingsSection` (deps: `manga, animeList`), `tasteProfileSection` (deps: `manga, log`), `analyticsSection` (deps: `manga, log`). The nested SVG sparkline IIFE inside `watchHistorySection` was intentionally left intact (pure SVG math, not a hook concern). JSX IIFEs replaced with bare `{constantName}` references. No behaviour changes.

---

#### Session 40 — Sync nudge actionable + patchEntry wired to chapter/episode commit (2026-06-10, commit `5c5344f`)

- `components/DetailView.tsx` — Added `onSync?: (id: string) => void` to `DetailModalProps` interface and destructured in `DetailModal`. Changed the static "Sync this entry to load anime scores & streaming links" text nudge in the notify.moe section to a clickable `<button>` that calls `onSync(manga.id)` when clicked. Renders only when `onSync` prop is provided (safe to omit).
- `app/page.tsx` — Added `patchEntry` to `useLibraryStore` destructure (`lib/store.ts` already exports it). Added `syncEntry(id: string)` per-entry sync handler: calls `/api/sync` with `{ id }` in request body, then re-fetches that single entry from `manga_list` and updates both the store list and `selectedManga`. Passed `onSync={syncEntry}` to `<DetailModal>`. Converted `commitChapterProgress` and `commitEpisodeProgress` from plain `async` functions to `useCallback` wired to `patchEntry` (store handles optimistic update + Supabase write + rollback on error); `reading_log` insert kept local in each function. `setSelectedManga` still called explicitly alongside `patchEntry` since patchEntry updates the store list but not the local `selectedManga` state that drives the open detail panel.

---

#### Session 39 — 5 confirmed bug fixes (2026-06-10, commit `f05e4de`)

- `app/stats/page.tsx` — Added `visibilitychange` listener after the existing `useEffect(() => { load() }, [load])`. Calls `load()` when `document.visibilityState === 'visible'`. Stats page now refreshes when the tab regains focus (e.g. after the extension logs a watch event in another tab).
- `components/DiscoverySection.tsx` — Added `swiped_at: new Date().toISOString()` to the `swipe_history` insert in the `dismiss` callback. Also captures the insert result and logs `console.error` on failure so silent failures are visible. Without `swiped_at`, the insert was silently failing if the column is NOT NULL with no default.
- `components/DetailView.tsx` — Added "Sync this entry to load anime scores & streaming links" nudge in the notify.moe section. Renders when `animeMalIdForNotify` is null but `manga.has_anime`, `manga.content_type === 'anime'`, or `manga.content_type === 'movie'`. User now knows why the scores section is empty instead of silently seeing nothing.
- `components/DetailView.tsx` — `RelationMergeButton`: added a two-column progress comparison (title, Ch. X/Y, Ep. X/Y for both `keep` and `remove`) before the merge button. User can verify progress on both entries before committing an irreversible merge.
- `WEBSITE_HANDOFF.md` — Marked `/api/cron/reset-daily` Known Issue as resolved: extension handles daily stat reset client-side via `chrome.storage.local` date key — no DB cron needed.

---

#### Session 38 — Phase 2 architecture modernisation: SWR migration in DetailModal (2026-06-10, commit `8967098`)

- `components/DetailView.tsx` — Replaced all 8 `useEffect`+`useState` data fetch pairs in `DetailModal` with `useSWR` calls. Each SWR key is `null` when the required IDs are absent (skips fetch). All calls share `{ revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 300_000 }`. The 8 sources:
  1. **AniList manga** — key `/api/anilist?mal_id=…&type=MANGA`; provides `alManga`.
  2. **AniList anime** — key `/api/anilist?mal_id=…&type=ANIME`; provides `alAnime`.
  3. **notify.moe** — key `/api/notifymoe?mal_id=…&title=…`; provides `notifyMoe`.
  4. **Wikipedia** — key `/api/wikipedia?title=…&mal_id=…`; provides `wikiData`.
  5. **MangaUpdates** — key `/api/mangaupdates?title=…`; provides `muData`.
  6. **ANN** — key `/api/ann?title=…` (null when `has_anime` is true); provides `annAnime`.
  7. **Jikan recs** — key `jikan-recs-{malId}-{type}`; fetcher calls `getJikanRecommendations()`; provides `jikanRecs`.
  8. **OMDB/IMDb** — key `omdb-{title}-{contentType}` (null when no stored API key); fetcher calls `omdbapi.com` directly; provides `imdbRating` / `imdbId`.
- `animeSuggestionDismissed` derivation moved to two small `useEffect` hooks (AniList manga data → suggest adaptation; ANN data → fallback suggestion). These are derive-from-data effects, not fetches.
- OMDB mid-session key save: inline "Save" + Enter handlers now call `setOmdbOverride({ imdbRating, imdbID })` (local state) instead of removed `setImdbRating`/`setImdbId` setters. `imdbRating` / `imdbId` values prefer `omdbOverride` over SWR result.
- Error states added for 5 sections (notify.moe, Wikipedia, MangaUpdates, AniList, Jikan recs): inline `text-[10px] text-zinc-600` message shown if the SWR call errors and a key was present.
- `package.json` + `package-lock.json` — `swr` added as a dependency.

---

#### Session 37 — Phase 1 architecture modernisation: Zustand store + QuickPeekSheet (2026-06-10)

**New files**
- `lib/store.ts` — Zustand store (`useLibraryStore`). State: `mangaList: Manga[]`, `isLoading: boolean`, `activePeekId: string | null`, `activeDetailId: string | null`. Actions: `setLibrary`, `openPeek`, `closePeek`, `openDetail` (also clears `activePeekId`), `closeDetail`, `patchEntry` (optimistic update with snapshot rollback + optional `showToast` callback for error).
- `components/QuickPeekSheet.tsx` — Bottom-sheet component. Props: `{ id: string, onOpenDetail: (id: string) => void }`. Reads entry from store (zero network calls). Renders: cover, title, author, content-type badge, status badge, progress label, synopsis (200-char truncated), top-3 genres. Two buttons: "Full Details" (calls `onOpenDetail(id)` then `closePeek`) and "Close" (`closePeek`). Slides up with CSS animation. Full-width mobile, `max-w-lg` centered on desktop.

**Modified files**
- `app/page.tsx` — Added `useLibraryStore` + `QuickPeekSheet` imports. `manga` state now reads from store (`mangaList`). `setManga` shim delegates to `useLibraryStore.getState().setLibrary()` for backward-compatibility with the 40+ call sites. `fetchManga` calls `setLibrary(data)` directly. Added `onOpenPeek` prop to `<LibraryCard>` (calls `openPeek(id)`). `QuickPeekSheet` rendered at root level below all modals, guarded by `{activePeekId && ...}`. `onOpenDetail` inside QuickPeekSheet sets both `selectedManga` (for DetailModal) and `openDetailStore(id)` (for store tracking).
- `components/LibraryCard.tsx` — Added optional `onOpenPeek?: (id: string) => void` to `LibraryCardProps`. Cover `<div>` is now a `role="button"` that calls `onOpenPeek(m.id)` (or falls back to `onOpenDetail(m)` if prop absent). Title `<button>` also calls `onOpenPeek(m.id)` (same fallback). The existing "Details" link (`onOpenDetail` via the Details button in Continue Watching strip) is unchanged — power users can skip peek. Added `[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]` to all 4 ± increment buttons (episode −/+, chapter −/+).

---

#### Session 36 — CLAUDE.md full codebase navigation map (2026-06-10, commit `f910e6c`)

- `CLAUDE.md` — Replaced the minimal skills-pointer stub with a full codebase navigation reference. Added 7 tables: entry points (15 files with roles), component map (33 components with what they render + where they're called from), API routes (28 routes with method/auth/cache TTL), lib/utility files (11 files with key exports), environment variables (13 vars with feature gates + ⚠️ API COST flags), known issues (3 items), and a 14-entry navigation guide ("if working on X → read Y"). Designed for zero-context agent sessions — any agent reading this file can navigate to the right file without scanning the codebase.

---

#### Session 35 — Phase 5: `app/page.tsx` under 2,000 lines (2026-06-10)

Target met: 2,902 → **1,969 lines**. Build passes clean. No behaviour changes.

**New file**
- `components/LibraryModals.tsx` — Contains all 9 self-contained modal/panel components extracted from `app/page.tsx`:
  - `AuthorModal` — author works list (Jikan), add-to-library buttons
  - `StudioModal` — studio anime titles (Jikan), add-to-library buttons
  - `RecommendationModal` — full detail panel for a single AI/trending recommendation
  - `ShelfPicker` — shelf assignment panel with create-shelf
  - `ShareModal` — public-share toggle + URL display
  - `TakeoutImportModal` — Google Takeout batch import
  - `HealthCheckModal` — library health check + Jikan enrichment
  - `RecommendationsListModal` — AI recommendations list overlay (loading/error/list)
  - `SyncResultsModal` — sync completion results overlay

**Modified files**
- `app/page.tsx` — Removed all 9 modal function bodies; replaced with imports from `@/components/LibraryModals`. Removed unused imports: `Image`, `getAuthorWorks`, `getAuthorInfo`, `getMangaById`, `searchAnimeByProducer`, `ArcEditor` (component import), `RereadSection`, `RewatchSection`, `UrlImportModal`, `SeriesMapModal`, `AniListMangaData`, `AniListAnimeData`, `RELATION_LABELS`, `formatCountdown`, `MUSeriesData`, `ANNRelatedWork`, `deepDiveSeries`, `TAKEOUT_ENTRIES`, `EditableNumber`, `RelationMergeButton`. Removed unused helpers: `STATUS_COLORS`, `timeAgo`, `MarkdownBold`. **Final line count: 1,969**.

---

#### Session 34 — Phase 4: `app/page.tsx` decomposition (2026-06-10)

Three new components extracted from `app/page.tsx`. Build passes clean.

**New files**
- `components/LibraryToolbar.tsx` — Header row with all action buttons (Recommend, Add, Sync, Health Check, Deep Search, Export dropdown, Share, Import, Sign Out) for desktop + the `MobileMenu` dropdown for mobile. Accepts all actions as callbacks. `NotificationBell` imported here. Props: `LibraryToolbarProps` (exported).
- `components/LibraryFilters.tsx` — Type-filter pills (All/Manga/Manhwa/Webtoon/Manhua/Anime/Movie) + status tab bar (All / Reading / … / Duplicates with count badge) + search input + sort selector. Props: `LibraryFiltersProps` (exported).
- `components/LibraryCard.tsx` — Full individual library card: cover, title/author, status dropdown, action icons (session, shelf, search, refresh, delete), synopsis, arc/re-read/re-watch badges, anime episode tracker, movie runtime gauge, chapter tracker + progress bar, genre tags, rating row, watch-prompt inline panel, notes textarea + public-review toggle. Props: `LibraryCardProps` (exported). Calls `supabase` directly only for the series multi-member `total_episodes` null-out (edge case kept local). All state updates (rating, public-review toggle) go back to parent via `onRatingChange` / `onPublicReviewToggle` callbacks for optimistic UI.

**Modified files**
- `app/page.tsx` — Replaced inline header block, type-filter + controls block, and entire card `map()` body with `<LibraryToolbar>`, `<LibraryFilters>`, and `<LibraryCard>` respectively. Removed `MobileMenu`, `RecommendationText` function bodies (now in toolbar). Removed `NotificationBell` import. Cleaned up unused lucide imports (`ThumbsUp`, `ThumbsDown`, `Folder`, `MapPin`, `PenLine`, `Flag`, `RefreshCw`, `ChevronDown`, `ChevronUp`, `Search`). **Line count: 3 520 → 2 902** (−618 lines).

---

#### Session 33 — Phase 3: filter dock reconciliation + Release Calendar mobile layout (2026-06-10)

**3a — Filter dock decision: filters stay in `app/page.tsx`**
- Read `components/Sidebar.tsx` in full. Sidebar is **navigation-only**: nav links, "Now Reading" hero (top reading entry), weekly chapter/episode stats, streak badge, "Up Next" list. Zero filtering controls.
- Filters in `app/page.tsx` (status tabs, type-filter pills, mood filter, search, sort) have no counterpart in Sidebar — no duplication exists.
- Decision: filters remain in `app/page.tsx`. No change to either file for 3a. Documented here so a future agent doesn't re-investigate.

**3b — Release Calendar mobile layout (`components/ReleaseCalendar.tsx`)**
- **Problem:** Day strip buttons used `width: ${100/7}%` — on narrow viewports all 14 day pills were squished to ~24px each (unusable touch targets).
- **Fix 1:** Changed pill width to `clamp(52px, calc(100% / 7), 64px)`. On mobile (360–420px screens) each pill is 52px — 6–7 fit in view and the rest scroll. On wide screens the `calc(100% / 7)` term caps at 64px so pills don't balloon.
- **Fix 2:** Added `scrollSnapType: 'x mandatory'` + `WebkitOverflowScrolling: 'touch'` on the strip container; `scrollSnapAlign: 'start'` on each pill. Strip now snaps cleanly when swiped.
- **Fix 3:** Added `dayStripRef` + `useEffect` to call `scrollIntoView({ inline: 'center', behavior: 'smooth' })` on the `data-today="true"` pill on mount — today is centred automatically instead of showing day 1.
- Added `useRef` to the import.
- Build passes. Zero new ESLint errors.

---

#### Session 32 — Phase 2: container-query grid + card visual hierarchy (2026-06-10, commits `08e4884` + `bc...`)

**2a — Container-query grid (`app/page.tsx`)**
- Replaced `style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}` with a `@container` wrapper + Tailwind CSS 4 container-query classes.
- Structure: outer `<div className="@container">` wraps inner `<div className="grid grid-cols-1 @[740px]:grid-cols-2 @[1120px]:grid-cols-3 gap-3">`.
- Breakpoints chosen to match the ~360px card minimum (740px ≈ 2 cards + gap; 1120px ≈ 3 cards + gap).
- No new dependencies — Tailwind CSS 4 has container queries built in.

**2b — Card visual hierarchy (`app/page.tsx`)**

Tier 1 (always visible, full contrast — no hover required):
- `ThumbsUp` / `ThumbsDown` buttons: base colour raised from `text-zinc-700` (near-invisible) → `text-zinc-500`.
- Rating label text (`Liked` / `Disliked` / `Not Rated`): was always `text-zinc-700`; now colour-coded — `text-emerald-400` (liked), `text-red-400` (disliked), `text-zinc-500` (unrated). Visible on touch devices without hover.
- "Rating" section label: `text-zinc-700` → `text-zinc-500`.
- Chapter progress label (`Ch. X / Y`): `text-zinc-500` → `text-zinc-300` so current progress reads clearly at a glance.

Tier 2 (always visible, reduced contrast):
- `"Studio:"` prefix label: `text-zinc-700` → `text-zinc-500`.
- `"Unknown author/studio"` fallback: `text-zinc-700` → `text-zinc-500`.
- Genre tags: `text-zinc-500` → `text-zinc-400`; capped at 3 (was 5) per spec.
- `"No Genres Listed"` fallback: `text-zinc-700` → `text-zinc-500`.

No information is now hover-only. Hover effects remain as enhancements only.

---

#### Session 31 — Phase 1: DetailModal extracted into components/DetailView.tsx (2026-06-10, commit `1d001d3`)

**Extraction: `components/DetailView.tsx` (new file)**
- `DetailModal`, `RelationMergeButton`, `SeriesPanel`, and `EditableNumber` moved out of `app/page.tsx` into this dedicated file.
- All four are exported named exports; `app/page.tsx` imports them from `@/components/DetailView`.
- `DetailModal` is also exported as `DetailModalProps` interface so callers can type the prop spread if needed.

**Isolated loading boundaries (the key structural change)**
- The single monolithic `useEffect` that fired all 8 API calls in parallel (blocking pattern) is now split into 8 separate `useEffect` hooks, each with its own `loading` state:
  - `alLoading` — AniList manga (mal_id → MANGA)
  - AniList anime — no skeleton; only renders when data arrives
  - `notifyLoading` — notify.moe scores → `ScoresSkeleton` while pending
  - `wikiLoading` — Wikipedia summary → `WikiSkeleton` while pending
  - `muLoading` — MangaUpdates badges skeleton (single short bar)
  - `jikanRecsLoading` — Jikan recs → `RecsSkeleton` while pending
  - `relationsLoading` — Jikan relations (for Series Map button)
  - OMDB/IMDb — no loading state; renders silently when key is present
- Skeleton components (`Skeleton`, `ScoresSkeleton`, `WikiSkeleton`, `RelationsSkeleton`, `RecsSkeleton`) are file-private helpers in `DetailView.tsx`.
- `app/page.tsx` — removed inline function bodies (~1 500 lines); import line updated.
- Build passes. ESLint errors dropped from 67 → 63 (baseline was 67 at time of work; original brief cited 56 — discrepancy was pre-existing `.vercel/` noise before session 25 fix).

---

#### Session 30 — Jikan proxy, warmup auth, Wikipedia labels, stats useMemo, AniList discovery, incremental grid (2026-06-10, commits `cafc0ad` + `0eb1dab`)

**Incremental grid rendering (`app/page.tsx`)**
- IntersectionObserver sentinel: library grid renders only first 40 cards on load, loads 20 more as sentinel scrolls into view (400px pre-load). Resets to 40 on filter/search/mood change. Zero new dependencies.

**AniList discovery catalog (`app/api/swipe-queue/route.ts`)**
- Replaced static Jikan `/top/manga` (same 50 titles every call) with two AniList GraphQL fetches against random pages 1–100 (SCORE_DESC, no adult). Up to 100 varied candidates per request. AniList `averageScore` (0–100) normalised ÷10 to match Jikan scale. Jaccard scoring unchanged.
- New `anilistFetch()`, `mapAniListItem()`, `ANILIST_QUERY` helpers added; `jikanFetch`/`mapItem` removed from this file.
- ⚠️ API COST: AniList GraphQL is free and rate-limit is generous. Two random-page fetches per Discover load = 2 calls. No caching (intentional — variety on every visit).

**Jikan direct browser calls (`lib/jikan.ts`, new `app/api/jikan-proxy/route.ts`)**
- New `/api/jikan-proxy?path=...` route: server-side general Jikan proxy with 429 retry (1.2s backoff × 2). Accepts any `/v4` path; allowlist regex prevents open-redirect abuse.
- `jikanGet()`: search paths still → `/api/jikan-search` (cached); all other paths → `/api/jikan-proxy` when in browser; direct to Jikan on server (no CORS concern).
- `getMangaAllRelations`, `getSeriesEntryDetail`, `getJikanEpisodes`, `getJikanEpisodeSynopsis`, `getAnimeAdaptations`: all converted from raw `fetch('https://api.jikan.moe/v4...')` to `jikanGet()`. Removed inline 429 retry boilerplate from `getSeriesEntryDetail` and episode functions (proxy handles it).

**Warmup sub-fetch auth (`proxy.ts`)**
- Added `/api/catalog`, `/api/shonenjump`, `/api/goodreads`, `/api/webtoons`, `/api/mangaplus`, `/api/jikan-proxy` to `isPublicApi` exemption. Cron-triggered `/api/warmup` fan-outs carry no session cookie; these routes were 302-ing to `/login` silently.

**Wikipedia infobox coverage (`app/api/wikipedia/route.ts`)**
- Added label variants to all `parseField` calls: `'Created by'`, `'Original creator'`, `'Drawn by'`, `'English publisher'`, `'Serialized in'`, `'No. of episodes'`, `'Genre(s)'`, `'Animation studio'`, `'Tankōbon'`, `'Series director'`, etc. Improves hit rate on articles with non-standard infobox keys.

**Stats page useMemo (`app/stats/page.tsx`)**
- Added `useMemo` to React imports.
- Extracted `animeStatsSection` (deps: `[animeList]`) and `readingVelocitySection` (deps: `[log]`) from JSX IIFEs into `useMemo` constants placed before the early loading return. Satisfies rules of hooks. Remaining 5 IIFEs (`watchHistorySection`, `watchDnaSection`, `ratingsSection`, `tasteProfileSection`, `analyticsSection`) still inline — safe to convert in a future session.

---

#### Session 29 — Offline-first extension sync + Jaccard discovery (2026-06-09, commit `be23894`)

- `extension/background.js` — Offline-first "store and forward" using `chrome.alarms`. Every event queued with a UUID `idempotency_key`. `chrome.alarms.create('syncFlush', { periodInMinutes: 1 })` wakes the MV3 service worker to flush the queue on schedule. `flushPending()` rewritten: sends entire queue to `/api/watch-event/batch` in one request; on success clears only the sent keys (atomic read-modify-write); on 5xx increments `retryCount` and drops events that exceed `MAX_RETRIES = 5`; on 401 clears the stale auth token. `self.addEventListener('online', ...)` also triggers a flush when the device comes back online.
- `app/api/watch-event/batch/route.ts` — New batch endpoint. Bearer token auth enforced; `user_id` set server-side. Upserts to `watch_sessions` with `onConflict: 'idempotency_key', ignoreDuplicates: true` — retries never double-count. Groups events by title to make one `match_library_entry` RPC call + one library update per show. Capped at 500 events/batch.
- `app/api/swipe-queue/route.ts` — Discover feed scoring upgraded to Jaccard similarity (`|intersection| / |union|`). Taste profile built from two sources: library entries with `status IN ('completed', 'watching')` (genre frequency, `log1p` scaled, weight 0.7) merged with swipe history signal (weight 0.3). Top-12 genres form the profile set. Candidate score = Jaccard × 0.8 + (MAL score / 10) × 0.2. Fisher-Yates shuffle within the top pool for variety. Library genres added as a 5th parallel Supabase query.
- `scripts/migrations.sql` — `watch_sessions` idempotency_key column (4-step: add nullable → backfill `gen_random_uuid()` → NOT NULL → UNIQUE constraint via `DO` block to avoid `IF NOT EXISTS` syntax error). `discover_jaccard_feed` Postgres RPC added (future: requires `discover_cache` table which doesn't exist yet — RPC safe to leave dormant).

#### Session 28 — pg_trgm DB fuzzy match + atomic merge RPC (2026-06-09, commit `9afbf45`)

- `app/api/watch-event/route.ts` — Replaced full JS library scan (loads entire `manga_list` into serverless memory on every extension heartbeat) with a single `match_library_entry` Supabase RPC. DB uses `pg_trgm` GIN indexes on `title` and `anime_title` columns. Threshold kept at 0.65. JS fallback retained if RPC errors. `normalise()`/`matchScore()` kept in file for fallback — no longer the primary path.
- `app/page.tsx` — `mergeMultiple` now uses `merge_entries(keep_id, drop_ids[])` RPC for the delete step. Atomically reassigns `watch_sessions.manga_id` and deletes duplicates in one DB transaction (prevents orphaned watch history if connection drops mid-merge). Both update and merge errors are now surfaced via `showToast` instead of silently failing.
- `scripts/migrations.sql` — Added `pg_trgm` extension, GIN indexes (`manga_list_title_trgm_idx`, `manga_list_anime_title_trgm_idx`), and both RPC function definitions for reproducibility.

#### Session 27 — Fix series total-episodes edit glitch (2026-06-09, commit `4953556`)

- `app/page.tsx` — Fixed `EditableNumber` for total episodes on series-grouped anime cards. **Bug:** `seriesEpTotal` summed ALL members' `total_episodes` (including Jikan-auto-populated sub-entry values), and the save target was `activeEpMember.id` (in-progress member), not the primary card. Typing 56 could result in 56+100=156 and save to the wrong entry. **Fix:** when `epMembers.length > 1`, saves `n` to the primary card (`m.id`) and nulls-out `total_episodes` on all other members so the displayed sum equals exactly what the user typed.

#### Session 26 — Extension: Netflix/streaming platforms show in NOW TRACKING immediately (2026-06-09, commit `268e71a`)

- `extension/background.js` — Added `KNOWN_STREAMING_PLATFORMS` set (Netflix, Prime Video, Disney+, Max, Hulu, Apple TV+, Tubi) and `isKnownStreamingPlatform()` helper. These platforms now update `yomu_last_tracked` and local session stats **immediately** in `handleEvent` — no longer waiting for an API library-match. Popup NOW TRACKING shows the correct show straight away instead of staying on a stale YouTube entry. DB updates (episode progress, watch time) still require an API library match to prevent non-anime content polluting the library. `sendToAPI` now skips the local stats update for streaming platforms to avoid double-counting (already done optimistically in `handleEvent`). YouTube and unknown sites remain fully gated.

#### Session 25 — Code-review fixes: auth middleware, duplicate detector, ESLint, migrations (2026-06-09, commit `b0cee03`)

- `proxy.ts` — Fixed cron jobs silently dead: auth middleware was 307-redirecting all Vercel Cron requests (no session cookie) to `/login`. Added `/api/cron/*` and `/api/warmup` to the public-API exemption. Routes secure themselves via `CRON_SECRET` Bearer header. Chapter-alert cron is now reachable.
- `components/DuplicateDetector.tsx` — Fixed `pairKey` order-dependence: was `` `${p.a.id}::${p.b.id}` `` (positional). If library re-sorted between sessions the same pair produced a different key and dismissed duplicates reappeared. Now `[p.a.id, p.b.id].sort().join('::')`. Also surfaced upsert errors: `dismiss()` now checks the Supabase result and calls `showToast` on failure instead of silently dropping it.
- `eslint.config.mjs` — Added `".vercel/**"` to `globalIgnores`. ESLint was linting minified build output in `.vercel/output/`, inflating problem count from 56 real issues to 3,067 noise entries.
- `scripts/migrations.sql` — Added `user_settings` and `chapter_notifications` DDL with RLS (both keyed on `auth.uid()`). Tables existed only in the live Supabase instance; the repo had no DDL for them. Both confirmed present in production (verified via Supabase MCP).

### Outstanding Tasks

- [x] **Phase 2: container-query card grid + card visual hierarchy** — Completed session 32. Grid uses `@container` / `@[740px]:grid-cols-2` / `@[1120px]:grid-cols-3`. Rating and progress are now Tier 1 (visible without hover). Genres capped at 3.

- [x] **Phase 3: filter dock reconciliation + Calendar mobile layout** — Sidebar is navigation-only; filters correctly stay in `app/page.tsx` (no change needed). Calendar day strip fixed: `clamp(52px…)` pill widths, `scrollSnapType`, auto-scroll to today on mount. Completed session 33.

- [x] **Phase 4: continue decomposing `app/page.tsx`** — Completed session 34. Extracted `LibraryToolbar`, `LibraryFilters`, `LibraryCard`. `app/page.tsx` is now 2 902 lines (was 3 520).

- [x] **Phase 5: further `app/page.tsx` reduction** — Completed session 35. Final line count: 1,969. All modal components extracted to `components/LibraryModals.tsx`. Unused imports and helpers cleaned up.

- [x] **CLAUDE.md codebase navigation** — Completed session 36. Full component map, API routes, env vars, and navigation guide written. Any new agent session starts with the correct file to read.

- [x] **Phase 2: SWR migration in DetailModal** — All 8 data fetches migrated to `useSWR`. Per-section skeletons and error states in place. Committed `8967098`. (session 38)

- [x] **Phase 2b: Migrate DetailModal open/close to store** — Completed session 42. `selectedManga` local state removed; replaced with `useLibraryStore(s => s.mangaList.find(m => m.id === s.activeDetailId) ?? null)`. All `setSelectedManga(m)` → `openDetailStore(m.id)`, `setSelectedManga(null)` → `closeDetail()`. Redundant `setSelectedManga` patch calls removed from `commitChapterProgress`, `commitEpisodeProgress`, `syncEntry`, and all DetailModal callbacks — `patchEntry`/`setManga` already update the store so the derived value auto-reflects. QuickPeekSheet `onOpenDetail` simplified to `openDetailStore` directly.

- [x] **Phase 3: patchEntry wired to chapter/episode commit** — Completed session 40. `commitChapterProgress` and `commitEpisodeProgress` now delegate optimistic update + Supabase write + rollback to `patchEntry`. `reading_log` insert kept local.

- [x] **Reload Chrome extension** — Extension reloaded by user (2026-06-10). `syncFlush` alarm now registered.

- [x] **Web-push notifications** — VAPID env vars confirmed set on Vercel (session 30).

- [x] **Feature request button** — `GOOGLE_SERVICE_ACCOUNT_JSON` + `Google_Sheet_ID` confirmed set on Vercel (session 30). Code handles both `Google_Sheet_ID` and `GOOGLE_SHEET_ID` casings.

- [x] **ANTHROPIC_API_KEY on Vercel** — confirmed set (session 30).

- [x] **Warmup route sub-fetches** — `/api/catalog`, `/api/shonenjump`, `/api/goodreads`, `/api/webtoons`, `/api/mangaplus` added to `isPublicApi` in `proxy.ts` (session 30).

- [x] **Jikan direct browser calls** — all 5 functions converted to `jikanGet()`; new `/api/jikan-proxy` route handles non-search paths in browser (session 30).

- [x] **Wikipedia infobox coverage** — additional label variants added to all `parseField` calls (session 30).

- [x] **Stats page remaining IIFEs** — All 5 converted to `useMemo` constants before the early return (session 41): `watchHistorySection` (`[watchSessions, manga, showAllSessions]`), `watchDnaSection` (`[watchSessions, manga]`), `ratingsSection` (`[manga, animeList]`), `tasteProfileSection` (`[manga, log]`), `analyticsSection` (`[manga, log]`). SVG sparkline nested IIFE inside watchHistorySection left intact. Build passes, no new TS/lint errors.

- [x] **menome.in.th integration** — No public API exists. Updated `app/sources/page.tsx`: status changed from `in_progress` to `declined`, description updated to "No public API available — integration not currently feasible."

- [x] **Infra: stale git/next index files** — Deleted `.git/index 2`, `.git/index 3`, `.git/index 4` and all iCloud-duplicated files in `.next/` (`routes.d 2.ts`, `cache-life.d 2.ts`, `validator 2.ts`, duplicate server/static dirs). The TS errors they caused are gone from app code. **Root cause (still present): repo lives in a synced folder.** iCloud recreates `* 2.*` files in `.next/` when the dev server runs. Permanent fix requires the user to move the repo to an unsynced path and/or exclude `.git` and `.next` from iCloud sync in System Settings → iCloud → iCloud Drive → Options.

- [x] **Mobile access guide / PWA polish** — Completed session 44. Created `public/icon.svg` (was missing), expanded `public/manifest.json` (name, scope, lang, categories, split icon purposes, shortcuts), fixed `app/layout.tsx` title strings (`'Manga Tracker'` → `'YOMU'`, appleWebApp title `'Manga'` → `'YOMU'`). iOS "Add to Home Screen" and Android PWA now show the correct icon and title.
  - Note for iOS: Apple still prefers a PNG `apple-touch-icon`. For best iOS icon quality, generate a 180×180 PNG from the SVG and add `{ "src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" }` to the manifest and `icons: { apple: '/apple-touch-icon.png' }` in `app/layout.tsx`. SVG is a valid fallback but iOS renders it with an uncontrolled crop.
  - `maximumScale: 1` in `viewport` prevents pinch-zoom (intentional for app-like feel — trade-off: accessibility concern for users who need zoom).

- [x] **Extension reliability + live card/stat updates** — Fixed session 43. Two root causes found and patched:
  - **Disconnects:** when the Supabase JWT expires (~1h), API 401s were calling `setAuthToken(null)` — permanently losing the token until the user visited YOMU again. Fixed by replacing `setAuthToken(null)` on 401 in both `sendToAPI` and `flushPending` with `tryRefreshToken()` — a new helper that finds any open YOMU tab, runs the cookie/localStorage harvest script, and silently reconnects. The duplicated token harvest code in `tabs.onUpdated` was refactored into a shared `harvestTokenFromTab(tabId)` helper.
  - **Live updates:** `visibilitychange` already handles tab-switch. Gap was YOMU open in foreground while extension logs — `visibilitychange` doesn't fire. Fixed by adding a 60s `setInterval` in `app/page.tsx` that calls `fetchManga()` while the tab is visible.

- [x] **iOS apple-touch-icon (180×180 PNG)** — Completed session 48. `public/apple-touch-icon.png` generated via sharp, added to manifest + layout metadata.

- [ ] **Activate Gemini Deep Search** — `lib/gemini.ts` and `app/api/deep-search/route.ts` are already wired. Add `GEMINI_API_KEY` to Vercel environment variables (get free key from Google AI Studio: https://aistudio.google.com/app/apikey). No code changes needed — the feature activates automatically once the env var is present. ⚠️ API COST: `gemini-2.0-flash` free tier; fires once per Deep Search modal open in parallel with Claude.

- [x] **Deep Search via Gemini (free)** — Implemented. `lib/gemini.ts` created: calls `gemini-2.0-flash` via REST (no new npm dependency), gated on `GEMINI_API_KEY` env var, 8s AbortSignal timeout, returns `{ synopsis, themes[], trivia }`. `app/api/deep-search/route.ts`: `enrichWithGemini()` runs in parallel with Claude arc detection via `Promise.all`; `DeepSearchResult` extended with `synopsis`, `themes`, `trivia` fields; `content_type` now accepted from request body and forwarded to Gemini. `components/DeepSearchModal.tsx`: displays Gemini synopsis (with "Save to entry" checkbox, auto-checked when synopsis exists), themes as violet pills, trivia in italic block; passes `content_type` in POST body; `handleSave` writes `synopsis` to `manga_list` when checkbox is checked. `app/page.tsx`: `content_type` passed to `<DeepSearchModal>`. `CLAUDE.md` env vars table updated with `GEMINI_API_KEY` entry. ⚠️ **To activate:** add `GEMINI_API_KEY` to Vercel environment variables (get key from Google AI Studio — free tier). Without the key the modal works exactly as before.

---

## Known Issues & Regressions

### UrlImportModal closes immediately on interaction — 2026-06-08
- **Symptom:** Clicking inside the "Import From URL" modal closed the DetailModal.
- **Root cause:** Modal renders inside backdrop div with `onClick={onClose}`. `mousedown` fired before `click` could be stopped.
- **Fix:** `components/UrlImportModal.tsx` — added `onMouseDown={e => e.stopPropagation()}`.
- **Prevention rule:** Any modal inside a backdrop `onClick={onClose}` div must have BOTH `onClick` AND `onMouseDown` stopPropagation on its outermost element.

### MangaDex chapters showing "No data" in browser — 2026-06-08
- **Symptom:** Expanding the 📖 Chapters section in DetailModal always showed "No chapter data found."
- **Root cause:** `lib/jikan.ts` called `api.mangadex.org` directly from the client. MangaDex blocks CORS.
- **Fix:** `app/api/mangadex/route.ts` — server-side proxy. Updated `lib/jikan.ts` to call `/api/mangadex`.
- **Prevention rule:** Never call MangaDex (or any CORS-restrictive API) directly from the browser. Always proxy through a Next.js API route.

### Auto-sync gauges overwriting independent progress — 2026-06-08
- **Symptom:** Advancing chapters silently overwrote `episodes_watched` and vice versa.
- **Root cause:** `commitChapterProgress` computed proportional `syncEp` and wrote it to DB.
- **Fix:** `app/page.tsx` — removed sync calculations from both commit functions.
- **Prevention rule:** Never write `episodes_watched` inside `commitChapterProgress` or `current_chapter` inside `commitEpisodeProgress`.

### Extension "Connect to YOMU" gave no feedback — 2026-06-08
- **Symptom:** Clicking "Connect to YOMU" opened the YOMU site but nothing happened — popup closed, dot stayed red.
- **Root cause:** `popup.js` called `window.close()` immediately after `chrome.tabs.create()`.
- **Fix:** Removed `window.close()`; popup polls `GET_STATUS` every 500ms. Content script pushes token via `SET_AUTH_TOKEN`.
- **Prevention rule:** Never `window.close()` a popup waiting for an async result. Always keep open until result confirmed.

### Vercel alternating Error/Ready builds — 2026-06-08
- **Symptom:** Every `git push` triggered one Error + one Ready deployment.
- **Root cause:** One Vercel build worker had stale `lib/jikan.ts` cache.
- **Fix:** Added a version comment to `lib/jikan.ts` to bust the cache hash.
- **Prevention rule:** If you see alternating Error/Ready with "export not found", touch the affected module with a comment. Run `npx vercel deploy --prod --force` once to flush.

### streaming-sites API returned 401 for extension — 2026-06-09
- **Symptom:** Extension's `fetchCustomSites()` always got 401.
- **Root cause:** Route used cookie-only auth; extension sends `Authorization: Bearer <token>`.
- **Fix:** `app/api/streaming-sites/route.ts` — dual-mode auth (Bearer first, cookie fallback).
- **Prevention rule:** Any API route called by the extension must support Bearer token auth. Cookie-only routes are browser-only.

### Netflix episode counter never advancing — 2026-06-09
- **Symptom:** Watching on Netflix didn't increment the episode counter.
- **Root cause (1):** Netflix title has no episode number → `episode: null` → API skipped `episodes_watched` update.
- **Root cause (2):** MV3 service worker terminates after ~30s; `send()` silently dropped events.
- **Fix:** DOM-scrape Netflix player for `S1:E5`; API increments by 1 when `is_complete && safeEpisode == null`; `send()` retries once after 1s.
- **Prevention rule:** Never silently swallow errors in `send()`. API must handle `episode: null` for `is_complete` events.

### notify.moe CORS blocked in browser — 2026-06-09
- **Symptom:** Direct browser fetch to `notify.moe` API fails with CORS error.
- **Root cause:** notify.moe API blocks cross-origin browser requests.
- **Fix:** `app/api/notifymoe/route.ts` — server-side proxy with 24h cache in `anilist_cache` table.
- **Prevention rule:** Never call notify.moe directly from the browser. Always use `/api/notifymoe` proxy.

### notify.moe scores never rendering (stale null cache) — 2026-06-09
- **Symptom:** notify.moe score bars never appeared; every modal open made a fresh API call.
- **Root cause:** When `findNotifyMoeByMalId` returned null, nothing was cached. Infinite miss loop.
- **Fix:** `app/api/notifymoe/route.ts` — upserts `payload: null` on miss; read path uses 2h TTL for nulls.
- **Prevention rule:** Always cache null/miss results with a shorter TTL. Never let a "no data found" path return without writing to cache.

### Vercel build fails on `.catch()` on Supabase upsert — 2026-06-09
- **Symptom:** `/api/wikipedia` returned 404 in production; entire commit failed to build.
- **Root cause:** `PostgrestFilterBuilder` implements `PromiseLike` (only `.then()`), not `Promise`. Calling `.catch()` on it is `TS2551`.
- **Fix:** `app/api/wikipedia/route.ts:194` and `app/api/notifymoe/route.ts:62` — removed `.catch(() => {})`.
- **Prevention rule:** Never call `.catch()` directly on a Supabase query builder return value. Use `try/catch` around the `await` instead.

### Turbopack RocksDB corruption in dev — 2026-06-09
- **Symptom:** `next dev` failed with `Failed to open database / invalid digit found in string`.
- **Root cause:** RocksDB SSTable files corrupt when the path contains a space (`Anime Website`).
- **Fix:** `package.json` — `devclean` script. `.claude/launch.json` uses `devclean`.
- **Prevention rule:** Always start dev via `npm run devclean`. Never run `next dev` directly in this project.

### Netflix session log showing blank titles — 2026-06-09
- **Symptom:** Extension session log rows showed `—` with no title.
- **Root cause:** Netflix parser returned `{ title: "" }` when DOM scrape + title parse both failed.
- **Fix:** `extension/content.js` — `if (!show || /^netflix$/i.test(show)) return null`.
- **Prevention rule:** All extension site parsers must return `null` (not empty-title object) on extraction failure.

### Extension flushPending data loss on SW termination — 2026-06-09
- **Symptom:** Offline-queued watch events disappeared after SW woke up.
- **Root cause:** `chrome.storage.local.remove('yomu_pending')` called before the loop. MV3 SW terminates after ~30s.
- **Fix:** `extension/background.js` — removes each item individually after its send completes.
- **Prevention rule:** Never bulk-remove a pending queue before processing in an MV3 SW. Always remove per-item after success.

### Extension aniwatch parser crash on malformed iframe URL — 2026-06-09
- **Symptom:** Tracking silently stopped on aniwatch iframes.
- **Root cause:** `new URL(url)` threw when `_parentContext.url` was empty (async race).
- **Fix:** `extension/content.js` line 70 — wrapped in try-catch.
- **Prevention rule:** Always wrap `new URL(untrustedString)` in try-catch in content scripts.

### Extension popup XSS via custom site hostname — 2026-06-09
- **Symptom:** Potential JS execution in popup via crafted custom-site hostname.
- **Root cause:** `$('sites-list').innerHTML` injected raw storage strings.
- **Fix:** `extension/popup.js` — `createElement`/`textContent` per chip.
- **Prevention rule:** Never use `innerHTML` with data from `chrome.storage.local`. Always use `textContent` or DOM creation.

### swipe_history dismiss not persisting (user_id + direction constraint) — 2026-06-09 / 2026-06-10
- **Symptom:** Dismiss X on Discover cards threw Supabase insert error; dismissed cards reappeared on reload.
- **Root cause 1:** `swipe_history` table was missing `user_id` column. RLS SELECT filtered by user_id but inserts stored null → inserts were invisible to the SELECT on next load.
- **Root cause 2:** `direction` CHECK constraint was `'right'|'left'` only. Code passes `'skip'` for dismiss → every dismiss was a constraint violation returning 400.
- **Fix:** `scripts/migrations.sql` — added `user_id uuid` column + index + RLS policies; dropped and recreated `direction` CHECK to include `'skip'`. Both applied to production via Supabase.
- **Prevention rule:** `swipe_history` inserts must include `user_id: session.user.id`. Always include `swiped_at`. Valid `direction` values: `'right'`, `'left'`, `'skip'`.

### Duplicate detection falsely flagging series members — 2026-06-08
- **Symptom:** Series members with similar titles appeared in Duplicates tab.
- **Root cause:** Duplicate scan didn't check `series_id`.
- **Fix:** `app/page.tsx` — both scans skip pairs where `a.series_id && a.series_id === b.series_id`.
- **Prevention rule:** Duplicate detection must always skip pairs sharing a non-null `series_id`.

### Cron jobs silently dead (auth middleware redirect) — 2026-06-09
- **Symptom:** Chapter-alert cron never fired. Vercel showed "success" (3xx) but route body never ran.
- **Root cause:** `proxy.ts` only whitelisted `/api/feature-request`. Vercel Cron sends no session cookie → `getUser()` returns null → 307 redirect to `/login`.
- **Fix:** `proxy.ts` — added `/api/cron/*` and `/api/warmup` to `isPublicApi` exemption.
- **Prevention rule:** Any route invoked by Vercel Cron (no session cookie) must be in the `isPublicApi` exemption in `proxy.ts`. Routes secure themselves with `CRON_SECRET`.

### DuplicateDetector dismissals not persisting across sorts — 2026-06-09
- **Symptom:** Dismissed duplicate pairs reappeared after the library re-sorted.
- **Root cause:** `pairKey` was `` `${p.a.id}::${p.b.id}` `` — order depends on list position. Re-sort changes position → different key → saved dismissal doesn't match.
- **Fix:** `components/DuplicateDetector.tsx` — `[p.a.id, p.b.id].sort().join('::')`.
- **Prevention rule:** Any key that identifies a pair of items must be order-independent. Always sort IDs before joining.

### Series total-episodes sum glitch — 2026-06-09
- **Symptom:** Setting total episodes to 56 on a series card resulted in 156 (or similar) after adding series members. Editing the field didn't fix it.
- **Root cause (1):** `seriesEpTotal` sums ALL members' `total_episodes` including Jikan-auto-populated values from sub-entries.
- **Root cause (2):** The `EditableNumber` saved to `activeEpMember.id` (in-progress member) rather than the primary card, so the sum didn't change.
- **Fix:** `app/page.tsx` — in series mode, edit saves `n` to `m.id` (primary card) and nulls `total_episodes` on all other members.
- **Prevention rule:** When editing a "series total" field, always save to the primary card and zero/null the sub-members so the displayed sum equals what was typed. Never save series-level aggregates to a sub-member.

### Extension NOW TRACKING showing stale site (e.g. YouTube) while watching Netflix — 2026-06-09
- **Symptom:** Watching on Netflix left the popup "NOW TRACKING" showing a previous YouTube session.
- **Root cause:** Netflix is not in `DEDICATED_ANIME_SITES`. `yomu_last_tracked` was only updated after API confirmed a library match. If match failed or was slow, the stale entry persisted.
- **Fix:** `extension/background.js` — added `KNOWN_STREAMING_PLATFORMS` set. These platforms update `yomu_last_tracked` and session stats immediately (optimistic), like dedicated anime sites. DB updates still require API match.
- **Prevention rule:** `KNOWN_STREAMING_PLATFORMS` and `DEDICATED_ANIME_SITES` must both be checked in `handleEvent`. New streaming services should be added to one of these sets so local stats update promptly.

### Discover dismiss (✕) not persisting across page reloads — 2026-06-10
- **Symptom:** Clicking ✕ on a Discover card removes it from the current view, but the card reappears after a page reload.
- **Root cause:** `swipe_history` insert in `components/DiscoverySection.tsx` was missing `swiped_at`. If the column is NOT NULL with no default, the insert failed silently.
- **Fix:** `components/DiscoverySection.tsx` `dismiss` callback — added `swiped_at: new Date().toISOString()` to insert object; now captures result and logs `console.error` on failure.
- **Prevention rule:** Always include `swiped_at` when inserting to `swipe_history`. Capture the Supabase result and log errors — never fire-and-forget inserts on user-visible actions.

### Session log not updating from extension (live tracking not reaching site) — 2026-06-10
- **Symptom:** Stats page Session Log not updating after extension logs watch events.
- **Root cause:** Stats page `app/stats/page.tsx` had no `visibilitychange` listener — `load()` only ran once on mount.
- **Fix:** `app/stats/page.tsx` — added `visibilitychange` listener that calls `load()` when tab becomes visible.
- **Prevention rule:** Any page that reads from `watch_sessions` or library state must have a `visibilitychange` listener calling its data-load function. The library in `app/page.tsx` already does this — stats page must too.

### /api/cron/reset-daily returns 404 — 2026-06-10
- **Symptom:** `GET /api/cron/reset-daily` returns 404. Daily stat reset never fires. Extension "Min today" counter may accumulate without resetting.
- **Root cause:** The route file either doesn't exist in the deployed build or is named differently to what Vercel cron config expects.
- **Fix:** Not needed. Extension tracks daily stats in chrome.storage.local (yomu_session_stats with date key). GET_SESSION_STATS auto-resets when date !== todayKey(). No DB cron required. Resolved.
- **Prevention rule:** Before fixing: run `find app/api/cron -type f` to confirm the actual filename. Check `vercel.json` (or project settings) for the cron schedule and the path it calls. The file must be `app/api/cron/reset-daily/route.ts` for the path `/api/cron/reset-daily` to resolve.

### Extension watch-time 2× inflation — 2026-06-10
- **Symptom:** Watch time accumulates at double the real duration (30 min watched → ~60 min logged).
- **Root cause:** `Math.round(30/60) = 1` minute per 30 s heartbeat → 2 minutes per minute watched.
- **Fix:** `extension/background.js` `updateSessionStats` — accumulates `delta/60` (fractional). `Math.round` only in `popup.js` `fmtTime` at display time.
- **Prevention rule:** Never call `Math.round` on sub-minute deltas before accumulating. Store `total_watch_minutes` as a float; round only at display time.

### Extension dedup suppressing ~90% of heartbeats — 2026-06-10
- **Symptom:** Episode progress rarely advanced despite watching. Extension appeared to track but DB barely updated.
- **Root cause:** Single 300 s dedup window for all events. 30 s heartbeats matched the same key → suppressed. Only 1 in 10 heartbeats reached the API.
- **Fix:** `extension/background.js` `isDuplicate()` — 10 s window for progress pings, 300 s for `is_complete` events.
- **Prevention rule:** Dedup windows must be type-specific. Progress heartbeats (30 s cadence) require ≤ 15 s window. Completion events can use 5 min.

### Extension-facing API routes blocked by middleware (Bearer token) — 2026-06-10
- **Symptom:** Extension calls to `/api/streaming-sites`, `/api/watch-event`, `/api/library-titles` were 302-redirected to `/login`. Extension doesn't send session cookies.
- **Root cause:** `proxy.ts` `isPublicApi` exemption only covered cron/warmup/public routes. Bearer-token routes were not exempted.
- **Fix:** `proxy.ts` — added `/api/streaming-sites`, `/api/library-titles`, `/api/watch-event`, `/api/watch-event/*` to `isPublicApi`. Routes authenticate via Bearer header inside the handler.
- **Prevention rule:** Any API route called by the Chrome extension must be in `isPublicApi` in `proxy.ts`. Extension requests carry no session cookies. All such routes do their own Bearer auth internally.

### Merge UI doesn't show target entry's episode/chapter total before confirming — 2026-06-10
- **Symptom:** When merging library entries (e.g. Ansatsu Kyoushitsu), the merge panel shows the entry name but not its current episode/chapter count. User cannot verify which card has the correct progress before committing an irreversible merge.
- **Root cause:** UX gap — `RelationMergeButton` rendered only the merge button with no progress context.
- **Fix:** `components/DetailView.tsx` `RelationMergeButton` — added a two-column `grid grid-cols-2` comparison div above the button. Displays title, Ch. X/Y (if chapter data present), and Ep. X/Y (if `has_anime` and episode data present) for both `keep` and `remove` entries.
- **Prevention rule:** `RelationMergeButton` now always shows progress before the button. Do NOT remove the comparison grid — merges are irreversible and users need to confirm which entry has the correct progress.

### watch_sessions inserts silently failing since idempotency_key column added — 2026-06-11
- **Symptom:** Library card episode counter advanced correctly (e.g. ep 31 → 32) but the Session Log on the Stats page showed no new rows. No error appeared anywhere.
- **Root cause:** Session 29 added `idempotency_key uuid NOT NULL` to `watch_sessions` with no default. The single-event `/api/watch-event` endpoint never provided this value. Every `watch_sessions.insert()` call failed with a Postgres NOT NULL constraint violation. The error was not checked (`await supabase.from(...).insert({...})` — no `const { error }` capture). Execution continued past the failed insert and the library `manga_list` update ran successfully — so the card updated but no session row was written.
- **Fix:** (1) DB: `ALTER TABLE watch_sessions ALTER COLUMN idempotency_key SET DEFAULT gen_random_uuid()` applied to production. (2) `app/api/watch-event/route.ts` — captured `{ error: sessionErr }` and added `console.error` log on failure. (3) `scripts/migrations.sql` — added DEFAULT line after the NOT NULL line.
- **Prevention rule:** After adding a NOT NULL column to `watch_sessions`, always add `SET DEFAULT gen_random_uuid()` immediately (or supply the value at every insert site). Never fire-and-forget a Supabase insert without capturing the error result — silent insert failures are invisible to the user and extremely hard to diagnose.

### notify.moe / AniList sections silent when anime_mal_id is missing — 2026-06-10
- **Symptom:** Entries with `has_anime=true` but no `anime_mal_id` showed empty notify.moe and AniList sections with no explanation. Static nudge text added in session 39 was not actionable.
- **Root cause:** SWR key is `null` when `animeMalIdForNotify` is null — fetches skip silently with no UI feedback. Static text told user to sync but gave no way to do it.
- **Fix (session 39):** `components/DetailView.tsx` notify.moe section — added static text nudge. **Fix (session 40):** nudge upgraded to a clickable `<button>` that calls `onSync(manga.id)`. `app/page.tsx` — `syncEntry(id)` handler added and passed as `onSync` to `<DetailModal>`.
- **Prevention rule:** Any section that silently skips due to a missing ID must show an actionable button (not just text) so the user can fix the gap without leaving the current view. A null SWR key is invisible to the user without UI feedback.

---

## Session Log

### Session — 2026-06-11 (session 48)
- User asked to tackle any outstanding tasks independently. Completed 3: iOS icon, Saiki K content_type, stats improvements.
- apple-touch-icon: used `sharp` (already in devDependencies) to rasterise the existing SVG to 180×180 PNG. No new dependencies added.
- Saiki K was tagged `content_type: 'manga'` despite being an anime — fixed directly in production DB via Supabase MCP.
- Stats improvements (Sync button, manual→watch_sessions, heatmap tooltips) were from this session's user requests, not backlog — all deployed and verified live.
- Only remaining actionable task: user must add `GEMINI_API_KEY` to Vercel — no code changes needed.

### Session — 2026-06-11 (session 47)
- User reported episode 32 visible on library card but no session log entry for it.
- DB query confirmed `manga_list.episodes_watched = 32`, `last_read_at = 23:19 UTC`, but latest `watch_sessions` row was ep 31 at 22:40. No ep 32 rows at all.
- Root cause: `watch_sessions.idempotency_key` was added NOT NULL (session 29) with no DB default. Single-event endpoint never supplied this value → every session insert silently failed. Library update still ran (error not checked) → card advanced, session log didn't.
- Fix: DB default (`gen_random_uuid()`) applied to production; error logging added to catch future silent failures.
- The batch endpoint (`/api/watch-event/batch`) always supplied `idempotency_key` (UUID per event) so it was unaffected. That's why some earlier rows did appear (they came from flushed batches), but completion events that went through the single endpoint left no session rows.
- Deployed `a1ef046`.

### Session — 2026-06-10 (session 46)
- Fixed all 5 extension bugs from research doc. Root causes were: float rounding at wrong point (a), single dedup window (b), no library title cache (c), no storage change listener (d), no push from background to open YOMU tabs (e).
- `/api/library-titles` was missing — `fetchLibraryTitles()` referenced it but it didn't exist. Created with dual Bearer/cookie auth. Added `Cache-Control: private, max-age=300` to reduce DB load.
- Discovered `proxy.ts` was blocking ALL extension Bearer-token routes (streaming-sites, watch-event, library-titles) because none were in `isPublicApi`. Added all three to the exemption.
- swipe_history had two separate DB bugs: missing `user_id` column (RLS blocked reads) and `direction` constraint missing `'skip'`. Both were already in `migrations.sql` from a prior session but applied to production now.
- `popup.js` `chrome.storage.onChanged` approach: no explicit cleanup needed — Chrome removes listeners automatically when the popup closes.
- Commit `0e3687c`. **Extension must be reloaded** (background.js changed).

### Session — 2026-06-10 (session 45)
- All remaining outstanding tasks completed.
- menome.in.th: no public API confirmed — marked declined on Sources page, no further action.
- Gemini: implemented as optional parallel enrichment step, not a replacement. `GEMINI_API_KEY` env var must be added to Vercel to activate. Without it the deep search modal behaves identically to before.
- Stale git index files deleted; `.next` duplicates also cleaned. iCloud will regenerate `.next` duplicates on next dev-server run — only a local TS noise issue, not a build/deploy problem.
- Install page linked from login (pre-auth) and extension page (post-auth) so users on any path can find it.

### Session — 2026-06-10 (session 44)
- PWA polish: created `public/icon.svg` (was completely missing — browser had no icon to show on home screen). Branded with YOMU lettermark.
- Expanded `manifest.json` with standard PWA fields; split icon `purpose` into two entries (spec requirement for maskable + any).
- Fixed two title string bugs in `app/layout.tsx` (tab title and iOS home-screen label both said "Manga Tracker" / "Manga").
- iOS still prefers a 180×180 PNG for `apple-touch-icon` — SVG fallback works but renders with uncontrolled crop on some iOS versions. Noted as follow-on in Outstanding Tasks.

### Session — 2026-06-10 (session 40)
- Sync nudge upgraded from static text → button. `onSync?: (id: string) => void` prop added to `DetailModalProps`; safe to omit (button only renders when prop is present).
- `syncEntry(id)` in `page.tsx`: per-entry sync (not full-library). Calls `/api/sync` with `{ id }` body, then re-fetches the single row and patches both store + `selectedManga`. Reuses existing `setSyncing` + `showToast` so the toolbar sync indicator fires.
- `patchEntry` wiring: both commit functions converted to `useCallback`. Deps are `[patchEntry, showToast, setSelectedManga]` — all stable references. `reading_log` insert kept local (not in store).
- `setSelectedManga` must be called explicitly alongside `patchEntry` because patchEntry patches `mangaList` in the store but not the local React state that keeps the detail panel open.
- Build clean. Deployed `5c5344f`.

### Session — 2026-06-10 (session 39)
- Fixed 5 confirmed bugs: stats visibility refresh, dismiss persistence, merge UI progress preview, anime sync nudge, and cron/reset-daily non-issue clarification.
- Stats `visibilitychange` fix mirrors the existing listener in `app/page.tsx` — same pattern, same `[load]` dep array.
- Dismiss fix: `swiped_at` was the root cause of the silent insert failure; also added error logging so future failures are visible in the console.
- Merge comparison grid added to `RelationMergeButton` — renders only when `current_chapter > 0`, `total_chapters` is set, or `has_anime` with episode data. No visual clutter on entries without progress.
- Anime sync nudge: placed in notify.moe section only (not duplicated in AniList or streaming links sections). Reads naturally as a call-to-action for the Sync button.
- `npm run build` passed clean with zero TypeScript errors. Deployed `f05e4de`.

### Session — 2026-06-10 (session 38)
- Phase 2 of architecture modernisation: migrated all 8 DetailModal external-API fetches from `useEffect`+`useState` to `useSWR`.
- SWR key is `null` when required IDs are absent — SWR natively skips the fetch, replacing the old `if (!manga.mal_id) return` guards.
- `animeSuggestionDismissed` derivation kept as two thin `useEffect` hooks (not fetches); they react to SWR data landing rather than driving fetches themselves.
- OMDB is the only source that calls an external domain directly from the browser (OMDB doesn't block CORS). The inline key-save flow was updated to `setOmdbOverride` since SWR's cached result can't be mutated without a `mutate()` call — local override is simpler for a one-shot user action.
- 5 error states added (subtle inline text); OMDB and Jikan relations silently fail (no error UI needed — OMDB shows nothing, relations button just hides).
- `npm run build` passes clean. No layout or data changes.

### Session — 2026-06-10 (session 37)
- Phase 1 of architecture modernisation: Zustand store (`lib/store.ts`) + QuickPeekSheet bottom sheet.
- `setManga` shim pattern used to keep all 40+ existing call sites working without a full sweep — delegates to `useLibraryStore.getState().setLibrary()`. This is intentional tech debt; Phase 2/3 will remove it progressively.
- `patchEntry` in store takes an optional `showToast` callback so it's usable from components that have a local toast (like `app/page.tsx`) without importing the toast utility itself.
- Cover + title in LibraryCard now call `onOpenPeek` first (peek → detail flow). Existing "Details" buttons in Continue Watching banner stay wired to `setSelectedManga` directly (power-user shortcut, skip peek).
- `activeDetailId` wired in store but DetailModal still driven by `selectedManga` local state — bridge via `openDetailStore` shim. Full DetailModal migration deferred to Phase 2.
- Build passes clean. No new dependencies except `zustand`.

### Session — 2026-06-10 (session 35)
- Phase 5 of UI layout refactor: target was sub-2,000 lines in `app/page.tsx`.
- Strategy: extract self-contained modal components only (no shared hooks, no prop-drilling of state that spans multiple sections).
- 7 top-level function components (AuthorModal, StudioModal, RecommendationModal, ShelfPicker, ShareModal, TakeoutImportModal, HealthCheckModal) removed from page.tsx → `components/LibraryModals.tsx`. Saved ~782 lines.
- 2 inline JSX blocks extracted to LibraryModals as `RecommendationsListModal` and `SyncResultsModal`. Saved ~120 more lines.
- Cleaned all imports that were only used by the removed code — `Image`, 4 unused jikan functions, 8 unused type imports, 3 unused helpers (`STATUS_COLORS`, `timeAgo`, `MarkdownBold`). Saved ~30 more lines.
- Final count: 1,969. Build passes clean. No behaviour changes.

### Session — 2026-06-10 (session 34)
- Phase 4 of UI layout refactor: extracted 3 components out of `app/page.tsx`.
- LibraryCard was the highest-value target (~440 lines of inline JSX per card). Passed all state-update callbacks as props; the card calls supabase directly only for the series multi-member episode-null edge case (kept local to avoid awkward callback chains).
- `onRatingChange` and `onPublicReviewToggle` callbacks added so optimistic UI updates reach the parent `manga` state array.
- LibraryToolbar absorbed `MobileMenu` and `RecommendationText` (the latter was unused after extraction).
- LibraryFilters: hit a Turbopack parser error on the array-literal expression inside JSX (`{([...].filter().map()}`). Fixed by extracting the tab definitions into a `TYPE_TABS` constant above the component — cleaner anyway.
- page.tsx: 3 520 → 2 902 lines. Build passes clean. No new ESLint errors.
- No new dependencies added. No design tokens changed.

### Session — 2026-06-10 (session 33)
- 3a: Sidebar is navigation-only (confirmed by full read). Filters stay in `app/page.tsx` — no duplication, no action required. Documented decision so it isn't re-investigated.
- 3b: Calendar day strip had 14 pills at `100%/7` width — usable on desktop (7 visible), unusable on mobile (14 pills at ~24px each). Fixed with `clamp(52px, calc(100%/7), 64px)` so mobile gets 52px tap targets and desktop stays proportional. Added CSS scroll-snap + `scrollIntoView` on today's pill.
- Build clean, no new ESLint errors. No new dependencies added.

### Session — 2026-06-10 (session 32)
- Phase 2 of UI layout refactor. Two separate commits: grid change first, card hierarchy second (as requested).
- Container-query breakpoints chosen to match 360px card min-width: 740px for 2-col, 1120px for 3-col. Tailwind CSS 4 has no plugin needed for container queries.
- Card hierarchy: the only Tier 1 items that were hidden were the rating buttons and the chapter progress label — all bumped to readable base contrast. No hover-only information remains on cards.
- Genre count reduced from 5 → 3 per spec. Genre tags nudged from `zinc-500` → `zinc-400` (Tier 2, slightly more readable without being Tier 1).
- Build clean; no new ESLint errors.

### Session — 2026-06-10 (session 31)
- Phase 1 of the UI layout refactor: extracted `DetailModal` (~1 500 lines) from `app/page.tsx` into `components/DetailView.tsx`. Also moved `RelationMergeButton`, `SeriesPanel`, `EditableNumber`.
- Key structural change: the original single monolithic `useEffect` (all 8 API calls) was split into 8 isolated effects, each with its own loading state. Slow APIs (Wikipedia, notify.moe, Jikan recs) now show per-section skeletons instead of blocking the whole view.
- `SeriesPanel` was co-located inside the old `page.tsx` SeriesPanel block — moved with the rest. No behaviour changes.
- Build clean. ESLint errors reduced (67 → 63); all new instances of `set-state-in-effect` are pre-existing patterns carried over from the original code, not newly introduced.
- Next step pending user sign-off: Phase 2 (container-query card grid + status badge always-visible).

### Session — 2026-06-10 (session 30)
- User confirmed VAPID, Google Sheets, and Anthropic env vars all set on Vercel — verified via Chrome extension → Vercel dashboard. Marked those tasks done.
- Tackled all 4 remaining code tasks: Jikan proxy (new `/api/jikan-proxy` route + `jikanGet()` updated), warmup auth fix (`proxy.ts` exemptions), Wikipedia infobox labels, stats `useMemo` refactor.
- Stats `useMemo`: converted only `animeStatsSection` and `readingVelocitySection` — the two where the complete IIFE body was confirmed from reads. Remaining 5 IIFEs deferred; they span 100–200 lines each and converting them safely requires reading every line.
- AniList discovery: replaced Jikan `/top/manga` (static 50 titles) with two random AniList GraphQL pages. Every Discover session now draws from a different pool of 100 candidates.
- Incremental grid: IntersectionObserver sentinel in `app/page.tsx` — 40 initial cards, +20 on scroll. Large libraries no longer block the main thread on initial render.
- Deployed `cafc0ad` (grid + AniList) and `0eb1dab` (4 code fixes) to Vercel.

### Session — 2026-06-09 (session 29)
- Continued Gemini consultation from previous session. Implemented two remaining recommendations from Gemini's concrete spec.
- Offline-first extension sync: `chrome.alarms` wakes the MV3 service worker every 60s to flush the pending queue to the new batch endpoint. UUID idempotency keys prevent double-counting on retry. 401 response clears stale tokens so the popup prompts re-auth instead of silently looping.
- `discover_jaccard_feed` Postgres RPC was applied to DB last session but references a `discover_cache` table that doesn't exist. Left dormant — not called anywhere. The JavaScript Jaccard scoring in `swipe-queue/route.ts` is the live implementation.
- Jaccard scoring in swipe-queue now sources taste profile from actual library (completed/watching) genres — more accurate than swipe history alone. The library add gives a stronger signal; swipe history is a lighter correction weight.
- Deployed `be23894` to Vercel. Extension reload required.

### Session — 2026-06-09 (session 28)
- Implemented Gemini's two highest-value recommendations (corrected for actual schema).
- `match_library_entry` RPC: pg_trgm GIN indexes on `title` + `anime_title`. Watch-event route no longer loads full library into memory — single indexed DB query instead. JS fallback retained.
- `merge_entries` RPC: atomically reassigns `watch_sessions` + deletes duplicates in one transaction. Both merge errors now surface via `showToast`. Watch history preserved on merge (was silently lost before).
- Both RPCs added to `migrations.sql`. Applied to production via Supabase MCP.
- Gemini's SQL bugs corrected: table name `library` → `manga_list`; `library_id` → `manga_id`; `title_english`/`title_romaji` removed (columns don't exist); threshold kept at 0.65 (not 0.4).

### Session — 2026-06-09 (sessions 25–27)
- Four code-review findings actioned: (1) cron/warmup paths exempted from auth middleware — chapter-alert cron was silently dead since day one; (2) `pairKey` made order-independent with `.sort()` — dismissals were vanishing after library re-sorts; (3) `.vercel/**` added to ESLint ignores — lint noise dropped from 3,067 to 56; (4) `user_settings` + `chapter_notifications` DDL added to `migrations.sql` — schema was non-reproducible.
- User reported extension popup showing YouTube while watching Saiki K on Netflix. Root cause: Netflix is non-dedicated, so `yomu_last_tracked` only updated after API round-trip. Fixed by adding `KNOWN_STREAMING_PLATFORMS` for optimistic local tracking.
- User reported Saiki K series card showing 156 total episodes after setting 56 and grouping series members. Root cause: sum of all members' `total_episodes` (Jikan-populated), save target was wrong member. Fixed: series-mode edit now saves to primary card and nulls sub-member totals.
- All changes deployed to `manga-tracker-hazel.vercel.app`. Extension reload required by user.

### Session — 2026-06-09 (sessions 22–24)
- Movie cards: repurposed `total_episodes` as runtime minutes; replaced chapter/episode tracker with yellow progress gauge.
- Calendar: AniList queried directly from browser on row click. Detail panel shows streaming links, score, genres, synopsis.
- Extension code review found 3 bugs: `flushPending` data loss, aniwatch `new URL()` crash, popup `innerHTML` XSS. All fixed (`ee9a469`).
- 23 junk `watch_sessions` rows deleted from Supabase. API now gates session logging on library match or known anime site.

### Session — 2026-06-09 (session 21)
- User wanted to fill in details (status, progress, date watched, notes, rating) at add time instead of hunting the card afterwards.
- Collapsible quick-details panel added below confirmed-title chip. Status pills context-aware per content type. All fields optional.

### Session — 2026-06-09 (session 20)
- Critical Vercel build failure: two `TS2551` errors (`PostgrestFilterBuilder` is `PromiseLike` not `Promise`; can't call `.catch()` on it). Fixed in `app/api/wikipedia/route.ts` and `app/api/notifymoe/route.ts`.

### Session — 2026-06-09 (sessions 18–19)
- Wikipedia `/api/wikipedia` proxy built (summary + infobox; 72h cache). Wikipedia panel in DetailModal.
- notify.moe null-cache loop fixed (2h miss TTL).
- YouTube parser added to extension (returns null unless title has episode marker). `isKnownAnimeSite()` guard added to watch-event API.

### Session — 2026-06-09 (session 17)
- notify.moe integrated via server-side proxy (CORS-blocked in browser). Score bars in DetailModal.
- AniDB, Anime-Planet, Annict, LiveChart reachable via AniList `externalLinks` — no extra API calls.
- Sources page expanded from 9 to 16 entries.

### Session — 2026-06-09 (session 16)
- Discover: hourly cache, member counts, Popular/New Anime sections, dismiss X → `swipe_history` taste profile.

### Session — 2026-06-09 (session 15)
- Continue Watching: `last_watched_site` written on every watch event; platform pill on banner and card badge.

### Session — 2026-06-09 (session 14)
- Extension daily stat reset via `todayKey()`. "Your Watch DNA" section added to Stats page.

### Session — 2026-06-09 (session 13)
- Community totals crowd-sourcing: `community_totals` table + `/api/community-totals`. `EditableNumber` on cards writes to DB + fires POST.

### Session — 2026-06-09 (sessions 11–12)
- Multi-type filter; `visibilitychange` recents refresh; streaming-sites dual-mode auth; 6 new extension platform parsers.

### Session — 2026-06-08 (sessions 8–10)
- Full code review; all Critical/High/Medium findings fixed. Extension Connect UX. Stats graphs (donuts, heatmap, trend).

### Session — 2026-06-08 (sessions 6–7)
- Removed auto-sync gauges. Movie filter. StudioModal. MangaDex chapters. OMDB/IMDb rating. Takeout import UI.

### Session — 2026-06-08 (sessions 1–5)
- Batch-enriched 88 entries; dual search; Library Health Check; Re-Watch tracking; `unwatched` status; calendar; sync results modal; content-type badges; series grouping; related works.

---

## Change History

### 2026-06-10 — Session 45 (install page, Gemini enrichment, stale index cleanup)
- `app/install/page.tsx` *(new)* — Public `/install` page: iOS/Android/desktop guides + FAQ.
- `proxy.ts` — `/install` added to `isPublicPage`.
- `app/login/page.tsx` — Link to `/install` added.
- `app/extension/page.tsx` — PWA nudge card added.
- `lib/gemini.ts` *(new)* — `gemini-2.0-flash` REST helper, gated on `GEMINI_API_KEY`.
- `app/api/deep-search/route.ts` — Gemini enrichment runs in parallel with Claude arc detection.
- `components/DeepSearchModal.tsx` — Synopsis, themes, trivia from Gemini; "Save to entry" checkbox.
- `app/page.tsx` — `content_type` passed to `<DeepSearchModal>`.
- `CLAUDE.md` — `GEMINI_API_KEY` added to env vars table.
- Stale `.git/index 2/3/4` and `.next/*2.*` files deleted.
- `app/sources/page.tsx` — menome.in.th: `in_progress` → `declined`.

### 2026-06-10 — Session 39 (5 bug fixes: stats visibility, dismiss persistence, merge progress preview, sync nudge, cron clarification)
- `app/stats/page.tsx` — `visibilitychange` listener added; stats refresh on tab focus.
- `components/DiscoverySection.tsx` — `swiped_at` added to dismiss insert; error logging on failure.
- `components/DetailView.tsx` — `RelationMergeButton` two-column progress comparison grid. Static sync nudge added to notify.moe section.
- `WEBSITE_HANDOFF.md` — `/api/cron/reset-daily` marked resolved (extension handles daily reset).

### 2026-06-10 — Session 37 (Phase 1 architecture: Zustand store + QuickPeekSheet)
- `lib/store.ts` *(new)* — Zustand store: `mangaList`, `isLoading`, `activePeekId`, `activeDetailId`; actions: `setLibrary`, `openPeek`, `closePeek`, `openDetail`, `closeDetail`, `patchEntry` (optimistic with snapshot rollback).
- `components/QuickPeekSheet.tsx` *(new)* — Bottom-sheet peek: cover, title, author, status badge, progress, synopsis (200-char), genres, "Full Details" / "Close" buttons. Reads from store, zero network calls.
- `app/page.tsx` — `setManga` shim delegates to `setLibrary()`; `onOpenPeek` prop added to `<LibraryCard>`; `QuickPeekSheet` rendered at root level.
- `components/LibraryCard.tsx` — Cover + title now call `onOpenPeek(id)` with fallback to `onOpenDetail`.

### 2026-06-10 — Session 36 (CLAUDE.md navigation map)
- `CLAUDE.md` — Full codebase navigation map (7 tables: entry points, component map, API routes, lib files, env vars, known issues, navigation guide). Replaces minimal stub.

### 2026-06-10 — Sessions 31–35 (UI refactor: Phases 1–5, all complete)
- `components/DetailView.tsx` *(new)* — `DetailModal`, `RelationMergeButton`, `SeriesPanel`, `EditableNumber`; 8 isolated `useEffect` hooks with per-section skeletons.
- `components/LibraryToolbar.tsx` *(new)* — Header action buttons + `MobileMenu`.
- `components/LibraryFilters.tsx` *(new)* — Type-filter pills, status tabs, search, sort selector.
- `components/LibraryCard.tsx` *(new)* — Full individual library card (562 lines).
- `components/LibraryModals.tsx` *(new)* — 9 modal/panel components: `AuthorModal`, `StudioModal`, `RecommendationModal`, `ShelfPicker`, `ShareModal`, `TakeoutImportModal`, `HealthCheckModal`, `RecommendationsListModal`, `SyncResultsModal`.
- `components/ReleaseCalendar.tsx` — Day strip: `clamp(52px, calc(100%/7), 64px)` pill widths; `scrollSnapType: 'x mandatory'`; auto-scroll to today on mount.
- `app/page.tsx` — **3,520 → 1,969 lines** (−1,551). Container-query grid (`@container` / `@[740px]:grid-cols-2` / `@[1120px]:grid-cols-3`). All extracted components imported. Unused imports cleaned.

### 2026-06-10 — Session 30 (Jikan proxy, warmup auth, Wikipedia, stats useMemo, incremental grid, AniList discover)
- `app/api/jikan-proxy/route.ts` *(new)* — Server-side Jikan proxy with 429 retry.
- `lib/jikan.ts` — `jikanGet()` routes all non-search browser calls through `/api/jikan-proxy`.
- `proxy.ts` — Added `/api/catalog`, `/api/shonenjump`, `/api/goodreads`, `/api/webtoons`, `/api/mangaplus`, `/api/jikan-proxy` to `isPublicApi`.
- `app/api/wikipedia/route.ts` — Extended `parseField` label lists.
- `app/stats/page.tsx` — `useMemo` for `animeStatsSection` and `readingVelocitySection`.
- `app/api/swipe-queue/route.ts` — AniList GraphQL random-page discovery; Jaccard scoring retained.
- `app/page.tsx` — IntersectionObserver incremental grid (40 initial, +20 on scroll).

### 2026-06-09 — Sessions 22–24
- `app/page.tsx` — Movie runtime gauge (total_episodes repurposed as runtime_minutes); quick-details panel on Add form
- `components/ReleaseCalendar.tsx` — Clickable rows; AniList detail panel with streaming links
- `extension/background.js` — flushPending per-item removal (data loss fix)
- `extension/content.js` — aniwatch URL try-catch; Netflix empty-title guard
- `extension/popup.js` — innerHTML → createElement/textContent (XSS fix)
- `app/api/wikipedia/route.ts` + `app/api/notifymoe/route.ts` — removed `.catch(() => {})` (TS2551 fix)

### 2026-06-09 — Sessions 18–19
- `app/api/wikipedia/route.ts` *(new)* — Wikipedia proxy; 72h cache; infobox + arc parsing
- `app/api/notifymoe/route.ts` — 2h null TTL; null upsert on miss
- `app/page.tsx` — Wikipedia collapsible panel in DetailModal
- `app/sources/page.tsx` — Wikipedia added as live source
- `extension/content.js` — YouTube parser; Netflix empty-title guard
- `app/api/watch-event/route.ts` — `KNOWN_ANIME_SITES` + `isKnownAnimeSite()` guard
- `package.json` — `devclean` script; `.claude/launch.json` — `devclean` in runtimeArgs

### 2026-06-09 — Sessions 13–17
- `lib/notifymoe.ts` *(new)* — notify.moe API client
- `app/api/notifymoe/route.ts` *(new)* — server-side proxy, 24h cache
- `app/api/community-totals/route.ts` *(new)* — GET/POST crowd-sourced totals
- `lib/anilist.ts` — `externalLinks` field; non-streaming links exposed
- `lib/supabase.ts` — `last_watched_site`; `SwipeRecord.direction` extended to `'skip'`
- `lib/jikan.ts` — `members` field; `getTopAnime()`; `getNewAnime()`
- `app/page.tsx` — Community totals editing; notify.moe score bars; "Also on" links; Continue Watching platform pill
- `app/api/watch-event/route.ts` — `last_watched_site` on match + insert
- `app/stats/page.tsx` — "Your Watch DNA" section
- `app/sources/page.tsx` — 9 → 16 sources
- `components/DiscoverySection.tsx` — Full rewrite: 4 sections, hourly cache, member counts, dismiss X

### 2026-06-09 — Sessions 11–12
- `app/page.tsx` — Multi-type filter; `visibilitychange` recents refresh
- `app/api/streaming-sites/route.ts` — Dual-mode auth
- `extension/content.js` — Netflix DOM scrape; 6 new platform parsers; `send()` retry
- `extension/background.js` — `fetchCustomSites()`; daily stat reset

### 2026-06-08 — Sessions 8–10
- `app/stats/page.tsx` — DonutChart + WatchHeatmap; full graph suite
- `extension/content.js` — YOMU-domain token harvesting
- `extension/background.js` — `SET_AUTH_TOKEN` handler
- `extension/popup.js` — polling UX; removed `window.close()`

### 2026-06-08 — Sessions 6–7
- `app/page.tsx` — Removed auto-sync gauges; Movie filter; StudioModal
- `components/UrlImportModal.tsx` — `onMouseDown` stopPropagation
- `lib/jikan.ts` — TypeScript fixes

### 2026-06-08 — Sessions 1–5
- Batch-enriched 88 manga entries; dual search; Library Health Check; Re-Watch tracking; `unwatched` status
- Progress snapshots; Title-Case sweep; Calendar; Sync results modal; content-type badges
- Series grouping; SeriesPanel; episode tracker; FMA patch; related works add buttons
