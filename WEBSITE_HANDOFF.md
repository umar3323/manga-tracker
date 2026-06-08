# Website Handoff

## Project Overview

YOMU is a personal anime/manga tracking web app built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, and Supabase (Postgres + auth). Live at `manga-tracker-hazel.vercel.app`. All core features are active: library tracking, series grouping, discovery, airing calendar, sync, stats, sharing. Session 7 completed all remaining Code-owner tasks from the Weekly Update doc: date attribution timestamp fix, duplicate dismissal cross-device persistence, MangaDex chapter listing, OMDB/IMDb ratings, and Google Takeout import UI.

---

## Current State

### Latest Changes

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

- [x] **OMDB IMDb rating — movie type search** — fixed in session 9 (`d7b1f13`)
- [x] **Stats tab graphs** — added in session 9 (`e2406da`): donuts, trend line, heatmap, hour-of-day
- [x] **Vercel alternating Error/Ready builds** — fixed in session 9 by busting jikan.ts cache (`d7b1f13`)

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

### Duplicate detection falsely flagging series members — 2026-06-08
- **Symptom:** Series members with similar titles appeared in Duplicates tab.
- **Root cause:** Duplicate scan didn't check `series_id`.
- **Fix:** `app/page.tsx` — both scans skip pairs where `a.series_id && a.series_id === b.series_id`.
- **Prevention rule:** Duplicate detection must always skip pairs sharing a non-null `series_id`.

---

## Session Log

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
- `app/stats/page.tsx` — DonutChart + WatchHeatmap components; graphs in Watch History (completion ring, trend, heatmap, hour-of-day), Status Breakdown (donut), Reading DNA (donut + coloured bars)
- `app/page.tsx` — OMDB fetch uses `type=movie` for movies
- `lib/jikan.ts` — version comment to bust Vercel build cache
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
