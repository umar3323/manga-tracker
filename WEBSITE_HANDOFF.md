# Website Handoff

## Project Overview

YOMU is a personal anime/manga tracking web app built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, and Supabase (Postgres + auth). Live at `manga-tracker-hazel.vercel.app`. All core features are active: library tracking, series grouping, discovery, airing calendar, sync, stats, sharing. Session 7 completed all remaining Code-owner tasks from the Weekly Update doc: date attribution timestamp fix, duplicate dismissal cross-device persistence, MangaDex chapter listing, OMDB/IMDb ratings, and Google Takeout import UI.

---

## Current State

### Latest Changes

- `app/page.tsx` — **Multi-type filter + recents refresh (session 12)**:
  - Anime filter tab now shows entries where `has_anime = true` in addition to `content_type === 'anime'/'movie'`, so manga entries with anime adaptations appear in both their primary tab and the Anime tab.
  - `typeCounts` updated to count `has_anime` entries toward the anime badge.
  - Added `visibilitychange` listener: re-fetches `manga_list` every time the user switches back to this tab — ensures episode count updates (from extension watch events in another tab) reflect immediately and bump Recents order.
- **Supabase**: Spirited Away `content_type` updated to `'movie'` (was `'anime'`).
- `app/api/streaming-sites/route.ts` — **Auth fix (session 11 code review)**: original route used cookie-only auth. Extension sends `Authorization: Bearer <token>`. Fixed `getUser()` to try Bearer first, fall back to cookie auth for browser requests — matching `watch-event/route.ts` pattern.
- `app/extension/page.tsx` *(new)* — Extension landing page: feature grid, supported-platform table with detection method, "How it works" explainer, 5-step install instructions, GitHub download button. Linked from Sidebar + tablet icon rail.
- `app/sources/page.tsx` — New **Extension Streaming Sites** section: built-in site grid (all 16 parsers), custom-sites list (from DB), "Add site" form (URL → hostname normalisation → POST to API → live update), hover-to-delete per site.
- `app/api/streaming-sites/route.ts` *(new)* — GET/POST/DELETE. GET and POST add normalise hostname (strips scheme/www/path). Duplicate insert returns 409. All endpoints dual-mode auth (Bearer + cookie).
- `extension/background.js` — `fetchCustomSites()` fetches `/api/streaming-sites` after auth and caches hostnames in `chrome.storage.local`. Called on startup (if token present), on `SET_AUTH_TOKEN`, and on `tabs.onUpdated` token grab. `GET_CUSTOM_SITES` message handler added.
- `extension/content.js` — `_customHostnames` loaded async from background on script load; `getBestParser()` checks custom hostnames after dedicated parsers and applies `fromTitle()` to matches.
- `components/Nav.tsx` — Extension tab added to tablet icon rail (`tabletTabs`); mobile bottom nav unchanged (5 items).
- `components/Sidebar.tsx` — Extension link added to desktop sidebar nav.
- **Supabase migration** — `custom_streaming_sites (id, user_id, hostname, display_name, created_at)` table with RLS (`auth.uid() = user_id`). Unique constraint on `(user_id, hostname)`.
- `extension/content.js` — **Multi-platform streaming support (session 11)**:
  - Added dedicated parsers: **Disney+** (DOM scrape), **Max/HBO** (DOM scrape), **Hulu** (title), **Apple TV+** (title), **Bilibili.tv** (title `EP N` pattern), **Tubi** (URL `s01e01` pattern)
  - Fixed **HiDive** parser to extract season/episode from URL (`/stream/show/s01e01`) instead of falling back to title
  - Split Funimation into its own stub entry (kept for legacy URLs)
  - Improved **`fromTitle()` fallback**: now strips branded suffixes without TLD (Netflix, Disney+, Max, etc.), handles `S1:E5` inline format, more robust episode extraction — any unknown site with episode info in the tab title will parse correctly
- `extension/content.js` — **Netflix tracking fixes (session 11)**:
  - Netflix parser now DOM-scrapes the player UI for `S1:E5` patterns using several known Netflix selector candidates before falling back to title parsing.
  - Parser also handles `S1:E5`-style format in the tab title itself.
  - `send()` now retries once after 1 s on failure — wakes a terminated MV3 service worker instead of silently losing the event.
- `app/api/watch-event/route.ts` — **Episode counter increment when episode is null**: When `is_complete` is true but `safeEpisode` is null (Netflix and others that don't expose episode number in title), `episodes_watched` is now incremented by 1 (was silently skipped). Auto-complete logic also applied in the null-episode path.

### Previous Latest Changes (session 10)

- `app/page.tsx` — **Code review fixes (session 10)**:
  - AbortController on all 6 DetailModal `useEffect` fetches (AniList ×2, MangaUpdates, ANN, Jikan recs, OMDB) — cancelled on cleanup.
  - `updateNotes` now calls `supabase.auth.getUser()` and adds `.eq('user_id', user.id)` to the update query (defence-in-depth over RLS).
  - `filtered`/`typeCounts` wrapped in `useMemo`; `endSession` in `useCallback`.
  - Cover-fetch `useEffect` concurrency guard via `fetchRunning` ref.
  - Toast timer stored in `toastTimer` ref; cleared on unmount.
  - `fetchManga` error path calls `setLoading(false)` before returning.
  - `recMalId` dead ternary fixed (was using `mal_id` twice; now correctly uses `anime_mal_id` for second branch).
  - `triggerDownload` properly appends/removes anchor element.
  - Both duplicate `STATUS_LABELS` declarations inside components removed.
  - `endSession` useCallback deps corrected.
- `app/api/watch-event/route.ts` — Comprehensive input sanitisation: `safeTitle` (255 chars), `safeSite` (100 chars), `safeEpisode`/`safeSeason`/`safeDuration`/`safeWatched` bounds-checked; timestamp validated (rejects NaN, >1hr future, >10yr past).
- `app/stats/page.tsx` — Auth guard in `load()`: checks `supabase.auth.getUser()` before any DB queries; shows empty page instead of silent failure.
- `extension/background.js` — `SET_AUTH_TOKEN` validates sender origin (must be `YOMU_HOST`) and JWT format before storing; `recentKeys` Map pruned every 30 min.
- `extension/content.js` — MutationObserver debounced with `requestAnimationFrame`; `setInterval` polling replaced with Navigation API (`navigation.addEventListener('navigate', ...)`); `tc()` skips connectives (of/and/the/a/an/…) mid-title.
- `lib/data/takeout-series.ts` *(new)* — 33-entry `TAKEOUT_ENTRIES` array extracted from `app/page.tsx` (was inline in the client bundle with personal viewing notes); notes stripped.
- `lib/jikan.ts` — `mapMangaResult` null-coalesces `mal_id`; `getJikanRecommendations` field names corrected (`episodes` not `total_episodes`); version comment to bust Vercel build cache.

### Previous Latest Changes (sessions 8–9)

- `app/stats/page.tsx` — **Graphs throughout Stats tab** (session 9):
  - `DonutChart` component (multi-segment SVG arcs) — reused in Status Breakdown and Reading DNA
  - `WatchHeatmap` component — 52-week episode calendar (cyan palette), mirrors `ReadingHeatmap`
  - Watch History section: Completion Rate ring (cyan, % overlaid), 8-week Watch Time Trend area/line chart, Episode Calendar heatmap, Hour-of-Day watch histogram (colour-coded morning/afternoon/evening/late-night)
  - Status Breakdown: donut chart alongside existing bars
  - Reading DNA: per-genre colour donut + coloured bar legend
  - All charts pure inline SVG — zero new dependencies

- `app/page.tsx` — **OMDB movie type fix** (session 9): All 3 OMDB fetch calls now use `type=movie` when `content_type === 'movie'`, `type=series` otherwise. Fixes movies returning no IMDb results.

- `lib/jikan.ts` — Added version comment at top to bust Vercel's stale module build cache. Fixes alternating Error/Ready deployment pattern that started in session 6.

### Previous Latest Changes (session 8)

- `extension/content.js` — **YOMU auth token harvesting**: Added a block at the end of the file that fires only on `manga-tracker-hazel.vercel.app`. Reads all `localStorage` keys, finds the Supabase JWT (`access_token`), and sends `{ type: 'SET_AUTH_TOKEN', token }` to the background worker. Retries up to 10 times every 800 ms to handle Supabase's async session restore.

- `extension/background.js` — Added `SET_AUTH_TOKEN` message handler. Stores token in `authToken` + `chrome.storage.local`, flushes the pending queue, and flashes the green badge.

- `extension/popup.js` — **Connection UX fix**: Removed `window.close()` from the Connect button handler. Popup stays open, shows yellow dot ("Connecting…"), polls `GET_STATUS` every 500 ms for up to 12 seconds, turns green with "✓ Connected!" on success.

### Previous Latest Changes (session 7)

- `app/page.tsx` — **Date attribution timestamp fix**: `commitChapterProgress` now uses the user's picked date as `last_read_at` when `attr.precision === 'exact'` (`timestamp = attr.precision === 'exact' && attr.date ? new Date(attr.date).toISOString() : now`). Previously always wrote `now`. Same fix applied to `commitEpisodeProgress` which now also writes `last_read_at` (it didn't before).

- `app/page.tsx` — **Duplicate dismissal cross-device persistence**: `dismissedPairs` state still initialises from localStorage (fast). A `useEffect` on mount calls `supabase.auth.getUser()` to load `user_metadata.dismissed_pairs` and merges them into state. `dismissPair()` now also calls `supabase.auth.updateUser({ data: { dismissed_pairs: arr } })` alongside the localStorage write.

- `app/page.tsx` + `lib/jikan.ts` — **MangaDex chapter listing in DetailModal**: Added `getMangaDexChapters(title)` to `lib/jikan.ts` — searches MangaDex by title, dedupes by chapter number, returns `{ chapters: MangaDexChapter[], total: number }`. In DetailModal, a collapsible "📖 Chapters (N)" section appears for any non-anime, non-movie entry. Lazy-loads on expand. Shows chapter number, volume badge, title, page count, and publish date per row.

- `app/page.tsx` — **OMDB/IMDb rating in DetailModal**: On DetailModal open, reads `localStorage.getItem('yomu_omdb_key')` and fetches from `omdbapi.com` if present. Displays `★ X.X IMDb ↗` below the MAL link when a result is found. A `⚙` button next to the rating opens a `window.prompt` to change the key. When no key is set, a small `+ IMDb rating` button appears that prompts for the key and immediately fetches.
  - ⚠️ **API COST**: OMDB free tier = 1,000 req/day. One fetch per DetailModal open (only when key is set). No polling. No server-side storage — key lives in `localStorage` only.

- `app/page.tsx` — **Google Takeout import UI**: Added `TakeoutImportModal` component with all 33 series hardcoded (mirrors `scripts/takeout-import.ts`). Shows which series will be added vs already in library. "Import N Series" button inserts via `supabase.from('manga_list').insert(toImport)`. After import, calls `fetchManga()` to refresh the grid and shows a toast. Accessible via **📦 Import** button in the desktop toolbar (added in session 8) and `📦 Takeout Import` in the mobile `⋮` menu.

- `lib/jikan.ts` — Added `MangaDexChapter` interface and `getMangaDexChapters(title, offset?)` public function. Internally: `getMangaDexId(title)` searches MangaDex `/manga` by title, then `getMangaDexChaptersByMangaId(id, offset)` fetches English chapters with deduplication by chapter number.

- `app/api/mangadex/route.ts` *(new)* + `lib/jikan.ts` — **MangaDex CORS fix**: MangaDex API blocks direct browser requests. Created a thin server-side proxy at `/api/mangadex?path=<encoded-path>` that forwards requests to `api.mangadex.org` with 5-minute server-side cache. Updated `lib/jikan.ts` `getMangaDexId` and `getMangaDexChaptersByMangaId` to call `/api/mangadex` instead of `api.mangadex.org` directly. Verified: Berserk loads 419 chapters correctly.

### Outstanding Tasks

- [ ] **Web-push notifications** — infrastructure exists (`app/api/cron/route.ts`, `sw.js`). Blocked on Vercel env vars only — user must add to Vercel dashboard:
  - `VAPID_EMAIL` — any email address
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — generate with `npx web-push generate-vapid-keys`
  - `VAPID_PRIVATE_KEY` — from same command

- [ ] **Feature request button** — code is correct (`app/api/feature-request/route.ts` already handles `GOOGLE_SERVICE_ACCOUNT_JSON`). Blocked on Vercel env var only — user must add `GOOGLE_SERVICE_ACCOUNT_JSON` (full service account credentials JSON as a single-line string) in Vercel dashboard. Also ensure `GOOGLE_SHEET_ID` is set.

- [ ] **Stats page inline IIFEs** (M-4) — `app/stats/page.tsx` has ~8 large `{(() => { ... })()}` JSX IIFEs (lines ~427, 519, 641, 821, 890, 919, 1110, 1188). These recompute on every render. To fix: move the `if (loading) return` guard to after all `useMemo` declarations, then extract each IIFE's body into a named `const` wrapped in `useMemo`. Complex restructure; safe to defer.

- [ ] **Watch-event API fuzzy match at scale** (H-4) — `app/api/watch-event/route.ts` loads the entire user library in JS on every POST to fuzzy-match the title. Fast for small libraries; degrades at scale. Long-term fix: `pg_trgm` extension + DB-level similarity search via Supabase RPC. Low urgency for personal use.

- [ ] **`onMergeMultiple` transaction safety** (H-6) — `app/page.tsx` `onMergeMultiple` fires two separate `supabase` calls (delete one entry, update another) without a transaction. A crash between the two leaves the DB in a half-merged state. Fix: create a Supabase RPC function `merge_entries(keep_id, drop_id)` that does both atomically.

- [ ] **Jikan direct browser calls** (M-1) — several `lib/jikan.ts` functions (`getAnimeAdaptations`, `getMangaAllRelations`, `getSeriesEntryDetail`, `getJikanEpisodes`, etc.) call `https://api.jikan.moe/v4/...` directly from the browser, bypassing the `/api/jikan` proxy. This is fine for now (Jikan has permissive CORS) but means no server-side rate-limit caching. Fix: route all Jikan calls through `/api/jikan`.

- [x] **OMDB IMDb rating — movie type search** — fixed in session 9 (`d7b1f13`)
- [x] **Stats tab graphs** — added in session 9 (`e2406da`): donuts, trend line, heatmap, hour-of-day
- [x] **Vercel alternating Error/Ready builds** — fixed in session 9 by busting jikan.ts cache (`d7b1f13`)
- [x] **Code review critical/high/medium/low findings** — fixed in session 10 (`8c4dd46`)

---

## Known Issues & Regressions

### UrlImportModal closes immediately on interaction — 2026-06-08
- **Symptom:** Clicking inside the "Import From URL" modal closed the DetailModal.
- **Root cause:** Modal renders outside the DetailModal panel div (which has `onClick` stopPropagation) but inside the backdrop div with `onClick={onClose}`. `mousedown` fired before `click` could be stopped.
- **Fix:** `components/UrlImportModal.tsx` — added `onMouseDown={e => e.stopPropagation()}`.
- **Prevention rule:** Any modal inside a backdrop `onClick={onClose}` div must have BOTH `onClick` AND `onMouseDown` stopPropagation on its outermost element.

### MangaDex chapters showing "No data" in browser — 2026-06-08
- **Symptom:** Expanding the 📖 Chapters section in DetailModal always showed "No chapter data found on MangaDex."
- **Root cause:** `lib/jikan.ts` called `api.mangadex.org` directly from the client (browser). MangaDex blocks cross-origin browser requests (CORS). The fetch silently failed, returning no data.
- **Fix:** Created `app/api/mangadex/route.ts` — a server-side proxy that forwards any path to `api.mangadex.org`. Updated `getMangaDexId` and `getMangaDexChaptersByMangaId` in `lib/jikan.ts` to call `/api/mangadex?path=...` instead of the MangaDex URL directly.
- **Prevention rule:** Never call MangaDex (or any API that sets restrictive CORS headers) directly from the browser. Always proxy through a Next.js API route.

### Auto-sync gauges overwriting independent progress — 2026-06-08
- **Symptom:** Advancing chapters silently overwrote `episodes_watched` and vice versa.
- **Root cause:** `commitChapterProgress` computed proportional `syncEp` and wrote it to DB.
- **Fix:** `app/page.tsx` — removed sync calculations from both commit functions.
- **Prevention rule:** Never write `episodes_watched` inside `commitChapterProgress` or `current_chapter` inside `commitEpisodeProgress`.

### Extension "Connect to YOMU" gave no feedback — 2026-06-08
- **Symptom:** Clicking "Connect to YOMU" opened the YOMU site but nothing happened — popup closed, dot stayed red.
- **Root cause:** `popup.js` called `window.close()` immediately after `chrome.tabs.create()`. The background's `chrome.tabs.onUpdated` did eventually grab the token but the popup was already gone, so the user saw no confirmation.
- **Fix:** `extension/popup.js` — removed `window.close()`; popup now stays open and polls `GET_STATUS` every 500 ms. `extension/content.js` — added YOMU-domain block that reads `localStorage` directly and sends `SET_AUTH_TOKEN` to background. `extension/background.js` — added `SET_AUTH_TOKEN` handler.
- **Prevention rule:** Never `window.close()` a popup that is waiting for an async result. Always keep the popup open until the result is confirmed. For any popup that needs auth feedback, use a polling pattern or a persistent `chrome.runtime.onMessage` listener.

### Vercel alternating Error/Ready builds — 2026-06-08
- **Symptom:** Every `git push` created two deployments — one `● Error` (35s, fails) and one `● Ready` (1m, succeeds). Production always used the Ready one so the site was fine, but builds were noisy and any cache-miss day would have no Ready fallback.
- **Root cause:** One of Vercel's parallel build workers cached `lib/jikan.ts` from before `searchAnimeByProducer` was added (session 6). That worker consistently failed with "Export searchAnimeByProducer doesn't exist." The other worker had a fresh cache and succeeded.
- **Fix:** `lib/jikan.ts` — added a version comment at line 1 to change the file hash, forcing all build workers to invalidate their cache entry. Combined with `npx vercel deploy --prod --force` to flush the cache immediately.
- **Prevention rule:** If you ever see alternating Error/Ready builds with the same cryptic "export not found" error, touch the affected module with a trivial comment change. Run `npx vercel deploy --prod --force` once to flush, then normal `git push` will work cleanly.

### streaming-sites API returned 401 for extension — 2026-06-09
- **Symptom:** Extension's `fetchCustomSites()` always got 401; custom sites never loaded into `chrome.storage.local`.
- **Root cause:** `streaming-sites/route.ts` used `createServerClient` (cookie-based auth only). Extension has no cookies — it sends `Authorization: Bearer <token>`. The `getUser()` call returned null.
- **Fix:** `app/api/streaming-sites/route.ts` — replaced `makeSupabase()` with `getUser(req)` that tries Bearer auth first, falls back to cookie auth for browser requests.
- **Prevention rule:** Any API route that the extension calls must support Bearer token auth (same pattern as `watch-event/route.ts` — check `Authorization: Bearer` header, call `supabase.auth.getUser(token)`). Cookie-only routes (`createServerClient`) are browser-only.

### Netflix episode counter never advancing — 2026-06-09
- **Symptom:** Watching anime on Netflix (e.g. Saiki K) did not increment the episode counter on the library card.
- **Root cause (1):** Netflix tab title is `"Show Name | Netflix"` with no episode number. The parser returned `episode: null`. `watch-event` API only updated `episodes_watched` when `safeEpisode != null`, so the field was never touched.
- **Root cause (2):** MV3 service worker terminates after ~30s inactivity. If the user watches without interacting with the extension, the SW dies mid-session. `send()` used `.catch(() => {})` — silently dropped the event, so nothing reached the API.
- **Fix (1):** `extension/content.js` — Netflix parser now DOM-scrapes player UI for `S1:E5` patterns; also parses `S1:E5` from title string.
- **Fix (2):** `app/api/watch-event/route.ts` — added `else` branch: when `is_complete && safeEpisode == null`, increment `episodes_watched` by 1.
- **Fix (3):** `extension/content.js` — `send()` retries once after 1s on failure to wake a dead service worker.
- **Prevention rule:** Never silently swallow errors in `send()` — always retry at least once to handle SW termination. The API must handle `episode: null` for `is_complete` events (some streaming sites never expose episode number in title/DOM).

### Duplicate detection falsely flagging series members — 2026-06-08
- **Symptom:** Series members with similar titles appeared in Duplicates tab.
- **Root cause:** Duplicate scan didn't check `series_id`.
- **Fix:** `app/page.tsx` — both scans skip pairs where `a.series_id && a.series_id === b.series_id`.
- **Prevention rule:** Duplicate detection must always skip pairs sharing a non-null `series_id`.

---

## Session Log

### Session — 2026-06-09 (session 12)
- Multi-type filter: Anime tab now includes `has_anime=true` manga entries. typeCounts reflects this. Spirited Away set to movie via Supabase.
- Recents live refresh: visibilitychange listener re-fetches library when user tabs back, so watch events from the extension update card order instantly.

### Session — 2026-06-09 (session 11 — continued, code review)
- Code review of all session-11 additions. One critical bug found and fixed: `streaming-sites` API used cookie auth only; extension calls with Bearer token → returns 401. Fixed to dual-mode auth matching `watch-event` pattern.
- Deployment verified via browser automation: `/extension` page renders correctly with all sections. `/sources` Extension Streaming Sites section shows all 16 built-in parsers and "Add site" button. API tested directly: GET 200 ✓, POST 201 ✓, DELETE 200 ✓. No console errors.
- Note: React controlled-input test via JS (`.value =` assignment) doesn't trigger `onChange`; form works correctly for real user input — this is a test limitation, not a bug.

### Session — 2026-06-09 (session 11)
- Extended extension to cover all major streaming platforms: Disney+, Max, Hulu, Apple TV+, Bilibili.tv, Tubi — all with episode extraction where possible. DOM scraping used for Disney+ and Max (title has no episode info). Improved `fromTitle()` fallback so any unrecognised site with episode info in the tab title works automatically.
- Netflix episode tracking was broken in two ways: (1) parser only scraped title — Netflix anime titles are just "Show | Netflix" with no episode info, so `episode` was always `null`; (2) `watch-event` API skipped `episodes_watched` update entirely when `safeEpisode == null`.
- Fixed parser to DOM-scrape Netflix player UI selectors for `S1:E5` patterns and also parse `S1:E5` in the title string.
- Fixed API to increment `episodes_watched` by 1 when `is_complete` but no episode number (fallback for any site that doesn't expose episode in title/DOM).
- Fixed `send()` in content.js to retry once after 1s on service worker termination (MV3 background can die after ~30s inactivity; events were being silently dropped).

### Session — 2026-06-08 (session 10)
- Full code review performed; all Critical, High, Medium, and most Low findings fixed in one commit (`8c4dd46`).
- Key security fixes: watch-event API now sanitises all 6 input fields; extension `SET_AUTH_TOKEN` validates sender origin + JWT format before storing; `updateNotes` adds explicit `user_id` guard.
- Key perf fixes: AbortController on DetailModal's 6 concurrent fetches (cancelled on close); MutationObserver debounced with rAF; 1s polling replaced with Navigation API.
- Key correctness fixes: `recMalId` dead ternary; `tc()` connective words; `fetchManga` early return now calls `setLoading(false)`; `TAKEOUT_ENTRIES` extracted from public bundle.
- 4 findings deferred as noted in Outstanding Tasks: M-4 (stats IIFEs), H-4 (DB-level fuzzy match), H-6 (merge transaction), M-1 (Jikan proxy coverage).
- Deployed to `manga-tracker-hazel.vercel.app` via `git push` (`3673140`).

### Session — 2026-06-08 (session 9)
- Added graphs throughout Stats tab: DonutChart + WatchHeatmap components; completion ring, 8-week watch trend, hour-of-day histogram, episode calendar in Watch History; donut in Status Breakdown; donut + coloured bars in Reading DNA. All pure inline SVG.
- Fixed OMDB fetching `type=series` for movies — now uses `type=movie` when `content_type === 'movie'`.
- Fixed Vercel alternating Error/Ready build pattern (since session 6) by adding a comment to `lib/jikan.ts` to bust its stale cache entry. After fix, `git push` triggers a single clean Ready build again.
- Graphs deploy initially failed (only Error, no Ready) due to the cache issue — forced with `npx vercel deploy --prod --force`. Subsequent push with the cache bust fix resolves it permanently.
- Outstanding tasks still requiring user action: VAPID env vars for web-push, `GOOGLE_SERVICE_ACCOUNT_JSON` for feature-request button.

### Session — 2026-06-08 (session 8)
- Fixed extension "Connect to YOMU" UX: popup was calling `window.close()` immediately, giving no feedback. Now stays open and polls for connection.
- Added content-script–based token harvesting (direct `localStorage` read on YOMU origin) as the reliable path — doesn't require `scripting` permission timing; fires as soon as the page is idle.
- Added `SET_AUTH_TOKEN` handler in `background.js` to receive the token pushed from content script.
- Root cause of the original issue: `chrome.scripting.executeScript` with `world: 'MAIN'` fires after the popup closes, so user saw nothing happen. New flow: popup stays open → content script pushes token → background stores it → popup poll detects and turns green.

### Session — 2026-06-08 (session 7)
- Fixed date attribution bug: `commitChapterProgress` was always writing `now` as `last_read_at` even when user picked an exact date in DateAttributionModal. Now uses picked date when `attr.precision === 'exact'`. Same fix applied to `commitEpisodeProgress`.
- Fixed duplicate dismissal not persisting cross-device: merged localStorage with Supabase `auth.updateUser` user metadata. Load on mount, save on every dismiss.
- Added MangaDex chapter listing to DetailModal. Lazy-load on expand, English chapters only, deduped by chapter number, shows vol/ch/pages/date.
- Added OMDB/IMDb rating to DetailModal. Key stored in localStorage. Prompt-based key entry (no dedicated settings UI). One fetch per modal open.
- Added Google Takeout import UI (`TakeoutImportModal`). 33 series hardcoded (matches `scripts/takeout-import.ts`). Shows diff vs existing library before confirming. Accessible from mobile menu.
- Deployed to `manga-tracker-hazel.vercel.app`.

### Session — 2026-06-08 (session 6)
- Removed auto-sync between chapter and episode gauges
- Added Movie to type filter tabs; episode tracker hidden for movies; both trackers dim when inactive
- "Similar in your list" entries now clickable via `onNavigate`
- Added StudioModal for anime/movie studio discovery via `searchAnimeByProducer`
- Fixed UrlImportModal close glitch — `onMouseDown` stopPropagation
- Fixed pre-existing `JikanAnimeItem` TypeScript error in `lib/jikan.ts`

### Session — 2026-06-08 (session 5)
- SeriesPanel online Jikan search; related works add buttons; series-aware episode tracker
- FMA Brotherhood DB patch; Jikan 429 retry in `getSeriesEntryDetail`
- Filter tabs larger and brighter; duplicate detection `series_id` check

---

## Change History

### 2026-06-08 — Sessions 8–9
- `app/stats/page.tsx` — DonutChart + WatchHeatmap; graphs in Watch History, Status Breakdown, Reading DNA
- `app/page.tsx` — OMDB `type=movie` for movies
- `lib/jikan.ts` — cache-bust version comment
- `extension/content.js` — YOMU-domain token harvesting block
- `extension/background.js` — `SET_AUTH_TOKEN` handler
- `extension/popup.js` — removed `window.close()`; polls for connection status

### 2026-06-08 — Session 6
- `app/page.tsx` — Removed auto-sync gauges: `commitChapterProgress` no longer writes `episodes_watched`; `commitEpisodeProgress` no longer writes `current_chapter`
- `app/page.tsx` — Movie filter tab added (amber style)
- `app/page.tsx` — Episode tracker hidden for `content_type === 'movie'`; inactive gauge dimming with `opacity-40` and `bg-zinc-600`
- `app/page.tsx` — "Similar in your list" entries changed to `<button onClick={() => onNavigate(sm)}>`
- `app/page.tsx` — Studio label + `StudioModal`: anime/movie cards show `Studio:` prefix; `StudioModal` calls `searchAnimeByProducer`
- `components/UrlImportModal.tsx` — Added `onMouseDown={e => e.stopPropagation()}`
- `lib/jikan.ts` — Fixed `JikanAnimeItem` TypeScript errors (replaced with `any`)

### 2026-06-08 — Sessions 1–5
- Batch-enriched 88 manga entries via Jikan
- Dual manga+anime search; Library Health Check modal; Re-Watch tracking; `unwatched` status
- Progress snapshots on re-read/re-watch; Title-Case sweep
- Calendar: global airing schedule, filter pills, 14-day window, `+ Add` for non-library entries
- Sync results modal with change chips; content-type badge on all library cards
- `score`, `published_from`, `published_to` DB columns; DateAttributionModal "Apply To All"
- Series grouping: `series_id` + `series_primary`; `SeriesPanel`; episode tracker on cards
- Jikan online search in SeriesPanel; related works `+ Lib` / `+ Series` buttons
- FMA Brotherhood DB patch; `getSeriesEntryDetail` 429 retry
