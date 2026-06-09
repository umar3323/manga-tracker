# Website Handoff

## Project Overview

YOMU is a personal anime/manga tracking web app built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, and Supabase (Postgres + auth). Live at `manga-tracker-hazel.vercel.app`. All core features are active: library tracking, series grouping, discovery, airing calendar, sync, stats, sharing, Chrome extension for watch tracking, and community totals crowd-sourcing. Sessions 13–17 added community totals editing, extension daily stat reset, anime watch DNA, Continue Watching platform tracking, hourly Discover refresh with dismiss, and multi-source integration (notify.moe, AniList external links, 16-entry sources page).

---

## Current State

### Latest Changes

#### Session 19 — YouTube filter + non-anime auto-create guard (2026-06-09)

- `extension/content.js` — Added YouTube parser (`match: /youtube\.com/i`). Returns `null` (no tracking) unless the video title contains an explicit episode marker (`Episode N`, `Ep N`, `E12`, etc.). Prevents generic YouTube content (documentaries, music, vlogs) from being logged.
- `app/api/watch-event/route.ts` — Added `KNOWN_ANIME_SITES` set + `isKnownAnimeSite()` helper. Auto-create of new library entries now only fires when `safeSite` matches a known dedicated anime streaming site. General platforms (YouTube, Netflix, Prime Video, Disney+, Max, Hulu, Apple TV+) can still update **existing** library matches but will never create new entries. This prevents non-anime content from auto-populating the library.

#### Session 18 — Wikipedia integration + bug fixes (2026-06-09)

- `app/api/wikipedia/route.ts` *(new)* — Wikipedia REST API proxy. `GET ?title=&mal_id=`. Fetches summary + infobox via `page/summary` + `page/mobile-sections` endpoints. Parses infobox table rows (author, illustrator, publisher, originalRun, volumes, episodes, directed, studio, genres). Finds arc/chapter list section and extracts item names as `arcSummary`. Falls back to search API if exact title not found. 72h cache in `anilist_cache` with `media_type='WIKIPEDIA'`, keyed by `mal_id` (or title hash when mal_id absent). Returns `WikipediaData` interface (also exported for reuse).
- `app/api/notifymoe/route.ts` — Fixed stale null caching: added `NULL_CACHE_TTL_MS = 2h` for misses (was never caching nulls — every modal open re-queried). Now upserts `payload: null` when `findNotifyMoeByMalId` returns null; uses `ttl = cached.payload ? 24h : 2h` on cache read.
- `app/page.tsx` — DetailModal Wikipedia panel: collapsible section below "Also on" links showing summary (always visible), infobox fields table (expanded), genres, arcSummary, "Read on Wikipedia ↗" link. State: `wikiData` + `wikiExpanded`. Fetch in DetailModal useEffect; cleanup resets both state values.
- `app/sources/page.tsx` — Added Wikipedia to `LINKED_SOURCES` (live tier, between notify.moe and MangaUpdates).
- `extension/content.js` — Netflix parser: added guard `if (!show || /^netflix$/i.test(show)) return null` to prevent empty/bare "Netflix" log entries.
- `package.json` — Added `"devclean": "rm -rf .next/dev/cache/turbopack && next dev"` script to clear Turbopack RocksDB before starting dev server (avoids SSTable corruption from space in path `Anime Website`).
- `.claude/launch.json` — Changed `runtimeArgs` to `["run", "devclean"]` so preview tool always clears stale cache.

#### Session 17 — Multi-source integration (2026-06-09, commit `bf2aa0c`)

- `lib/notifymoe.ts` *(new)* — notify.moe REST API client. `findNotifyMoeByMalId(malId, title)` searches by title then matches via `mappings[].serviceId` for MAL ID. `getNotifyMoeAnime(notifyId)` direct-fetch by notify.moe internal ID. Returns `NotifyMoeAnime` with `rating: { overall, story, visuals, soundtrack, overall_count }`. **Server-side only** (CORS blocked for browser requests).
- `app/api/notifymoe/route.ts` *(new)* — Server-side proxy for notify.moe. `GET ?mal_id=&title=`. Caches in `anilist_cache` table with `media_type='NOTIFY_MOE'`. 24h TTL. Falls back to stale cache if fresh fetch returns null.
- `lib/anilist.ts` — Added `AniListExternalLink` interface and `externalLinks: AniListExternalLink[]` field to `AniListAnimeData`. `fetchAniListAnime` now filters `externalLinks` by `type !== 'STREAMING'` and exposes them separately from `streamingLinks`. AniList returns links to AniDB, Anime-Planet, Annict, LiveChart etc. with `type: 'INFO'` — no extra API calls needed.
- `app/page.tsx` — DetailModal: notify.moe score bars (Overall/Story/Visuals/Soundtrack, rendered as progress bars). "Also on" link buttons for `externalLinks` with emoji icons per site (`SITE_ICONS` map). Both appear in the anime detail panel alongside existing AniList/streaming data.
- `app/sources/page.tsx` — Expanded `LINKED_SOURCES` from 9 to 16 entries across three groups: Direct APIs (MyAnimeList, AniList, notify.moe, Kitsu, MangaUpdates, MangaDex, MangaPlus, Shonen Jump, Webtoons, Goodreads, ANN), Via AniList cross-links (AniDB, Anime-Planet, Annict, LiveChart.me), Planned (menome.in.th).

#### Session 16 — Discover improvements (2026-06-09)

- `components/DiscoverySection.tsx` — Full rewrite: 4 sections (Popular Manga, New Manga, Popular Anime, New Anime). Genre filter pills per section. Hourly cache key `${YYYY-MM-DD-HH}-${genreId}` so data refreshes every hour. 5-min interval checks if hour has flipped and re-fetches. Member/reader count shown per card (`👥 N`). Dismiss X button on hover — saves `direction: 'skip'` to `swipe_history` table to build taste profile.
- `lib/jikan.ts` — Added `members?: number | null` to `JikanSearchResult`. Added to `mapMangaResult` and `mapAnimeResult`. Added `getTopAnime()` and `getNewAnime()` functions.
- `lib/supabase.ts` — Extended `SwipeRecord.direction` type to include `'skip'`.

#### Session 15 — Continue Watching + platform tracking (2026-06-09)

- `app/page.tsx` — Continue Watching banner: reads `last_watched_site` to show a colour-coded platform pill next to the label (e.g. "🎬 Netflix" in Netflix red). Library card badge shows platform name instead of generic "🎬 tracked". `SITE_DISPLAY` and `SITE_COLORS` maps added.
- `app/api/watch-event/route.ts` — Added `last_watched_site: safeSite` to the matched-entry updates object and new-entry insert payload.
- `lib/supabase.ts` — Added `last_watched_site: string | null` to `Manga` type.

#### Session 14 — Extension daily reset + anime watch stats (2026-06-09)

- `extension/background.js` — Daily reset for extension session stats: `todayKey()` returns `YYYY-MM-DD`. `updateSessionStats` resets all counters if `stats.date !== todayKey()`. `GET_SESSION_STATS` also resets stale date on read.
- `app/stats/page.tsx` — Added "Your Watch DNA" section: hero stats (today's time/eps, active days, rewatches), genre donut + bars from `watch_sessions`, watch personality label, top watched titles with RE badge for rewatches. Uses same `watch_sessions` Supabase table that the extension writes to.

#### Session 13 — Community totals (2026-06-09)

- **Supabase** — New `community_totals` table: `(id, mal_id, content_type, total_chapters, total_episodes, updated_by, updated_at)`. Unique on `(mal_id, content_type)`.
- `app/api/community-totals/route.ts` *(new)* — `GET ?mal_id=&content_type=` returns record or null. `POST` body `{ mal_id, content_type, total_chapters?, total_episodes? }` upserts on conflict.
- `app/page.tsx` — Card chapter/episode totals replaced with `<EditableNumber>` that writes to `manga_list` + fires POST to `/api/community-totals`. Add-entry flow back-fills missing totals from community data on insert.

### Outstanding Tasks

- [ ] **Web-push notifications** — infrastructure exists (`app/api/cron/route.ts`, `sw.js`). Blocked on Vercel env vars only — user must add to Vercel dashboard:
  - `VAPID_EMAIL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

- [ ] **Feature request button** — blocked on `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_SHEET_ID` in Vercel dashboard.

- [ ] **ANTHROPIC_API_KEY on Vercel** — "Analyse URL" feature in DetailModal fails in production without this. User must add to Vercel dashboard.

- [ ] **Stats page inline IIFEs** (M-4) — `app/stats/page.tsx` has ~8 large `{(() => { ... })()}` JSX IIFEs (lines ~427, 519, 641, 821, 890, 919, 1110, 1188). Extract into `useMemo` constants. Safe to defer.

- [ ] **Watch-event API fuzzy match at scale** (H-4) — `app/api/watch-event/route.ts` loads full library in JS on every POST. Long-term fix: `pg_trgm` + DB-level RPC. Low urgency for personal use.

- [ ] **`onMergeMultiple` transaction safety** (H-6) — `app/page.tsx` `onMergeMultiple` fires two separate Supabase calls without a transaction. Fix: create RPC `merge_entries(keep_id, drop_id)`.

- [ ] **Jikan direct browser calls** (M-1) — some `lib/jikan.ts` functions call `api.jikan.moe` directly from the browser. Route all through `/api/jikan`.

- [ ] **menome.in.th integration** — Thai anime community site. No public API found. Currently listed as "planned" on Sources page. Revisit if an API or scrape path is discovered.

- [ ] **Reload Chrome extension** — after `background.js` daily reset change, user must go to `chrome://extensions` and click Reload on the YOMU extension.

- [ ] **Wikipedia infobox coverage** — infobox parsing is regex-based on HTML table rows; some articles use different field labels (e.g. "Story by" vs "Written by"). Coverage will be incomplete for some titles. Low urgency; can be improved by adding label variants to the `parseField` calls in `app/api/wikipedia/route.ts`.
  - ⚠️ API COST: Wikipedia REST API is free with no rate limits. Each novel Wikipedia page fetch = 2 HTTP calls (summary + mobile-sections). Cached 72h per title.

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
- **Root cause:** One Vercel build worker had stale `lib/jikan.ts` cache from before `searchAnimeByProducer` was added.
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
- **Fix:** `app/api/notifymoe/route.ts` — server-side proxy with 24h cache in `anilist_cache` table (`media_type='NOTIFY_MOE'`).
- **Prevention rule:** Never call notify.moe directly from the browser. Always use `/api/notifymoe` proxy.

### notify.moe scores never rendering (stale null cache) — 2026-06-09
- **Symptom:** notify.moe score bars never appeared in DetailModal even for well-known anime; every modal open made a fresh API call and returned null.
- **Root cause:** When `findNotifyMoeByMalId` returned null, nothing was cached. On next open the TTL check found no row → re-queried → null again. Infinite miss loop.
- **Fix:** `app/api/notifymoe/route.ts` — now upserts `payload: null` on miss; read path uses `ttl = payload ? 24h : 2h`.
- **Prevention rule:** Always cache null/miss results with a shorter TTL. Never let a "no data found" path return without writing to cache.

### Turbopack RocksDB corruption in dev — 2026-06-09
- **Symptom:** `next dev` failed with `Failed to open database / invalid digit found in string`.
- **Root cause:** RocksDB SSTable files in `.next/dev/cache/turbopack/` corrupt when the path contains a space (`Anime Website`). Stale cache from a prior session triggers the error.
- **Fix:** `package.json` — `devclean` script: `rm -rf .next/dev/cache/turbopack && next dev`. `.claude/launch.json` uses `devclean` so the preview tool always clears the cache first.
- **Prevention rule:** Always start the dev server via `npm run devclean` (not `npm run dev`) in this project. Never run `next dev` directly.

### Netflix session log showing blank titles — 2026-06-09
- **Symptom:** Extension session log rows showed `—` with no title; entries had empty show name.
- **Root cause:** Netflix parser fell through all extraction paths (DOM scrape + title string parsing both failed), resulting in `show = ""` or `show = "Netflix"`.
- **Fix:** `extension/content.js` — added guard: `if (!show || /^netflix$/i.test(show)) return null` so the parser returns null instead of logging a broken entry.
- **Prevention rule:** All extension site parsers must return `null` (not an object with empty title) when title extraction fails. The `send()` function skips null results.

### swipe_history insert failed with user_id column — 2026-06-09
- **Symptom:** Dismiss X on Discover cards threw Supabase insert error referencing unknown column `user_id`.
- **Root cause:** `swipe_history` table has no `user_id` column (cols: id, mal_id, title, direction, genres, synopsis, swiped_at).
- **Fix:** Removed `user_id` reference from dismiss insert; used plain `insert` without `onConflict`.
- **Prevention rule:** Before adding a column to a Supabase insert, verify the column exists in the table schema. `swipe_history` does not have `user_id`.

### Duplicate detection falsely flagging series members — 2026-06-08
- **Symptom:** Series members with similar titles appeared in Duplicates tab.
- **Root cause:** Duplicate scan didn't check `series_id`.
- **Fix:** `app/page.tsx` — both scans skip pairs where `a.series_id && a.series_id === b.series_id`.
- **Prevention rule:** Duplicate detection must always skip pairs sharing a non-null `series_id`.

---

## Session Log

### Session — 2026-06-09 (session 19)
- User noticed extension tracking non-anime YouTube content (e.g. "The Moon Is An Alien Megastructure").
- Root cause 1: `fromTitle()` fallback ran on every page including YouTube, with no episode-marker filter.
- Root cause 2: API auto-created library entries from any site on completion — no anime-site guard.
- Fix 1: YouTube parser added to content.js; returns null unless title has episode markers.
- Fix 2: `isKnownAnimeSite()` guard added to watch-event API; auto-create only for dedicated anime streaming sites.
- YouTube anime episodes (e.g. "One Piece Episode 1100 - YouTube") still tracked. Stats page unaffected — `watch_sessions` rows still written for all library-matched events regardless of site.

### Session — 2026-06-09 (session 18)
- User requested Wikipedia as a data source for author, publication history, arc info, etc.
- Built `/api/wikipedia` proxy (2 REST calls: `page/summary` + `page/mobile-sections` for infobox). Regex parses infobox table row HTML. 72h cache. Falls back to search API.
- Fixed notify.moe null cache loop (stale nulls never written; fixed with 2h miss TTL + null upsert).
- Fixed Turbopack RocksDB corruption: `devclean` script + launch.json update.
- Fixed Netflix blank title log rows: parser returns null when show extraction fails.
- Wikipedia panel added to DetailModal (collapsible, below "Also on"; shows summary + infobox fields + arcs).
- Wikipedia added to Sources page (live tier).

### Session — 2026-06-09 (session 17)
- User asked to integrate 7 new sources: hummingbird.me (Kitsu rebrand), menome.in.th, anime-planet.com, anidb.net, kitsu.app, annict.com, notify.moe.
- notify.moe: open REST API but CORS-blocked. Built server-side proxy (`/api/notifymoe`) with 24h cache. Scores shown as progress bars in DetailModal.
- AniDB, Anime-Planet, Annict, LiveChart: already reachable via AniList `externalLinks` GraphQL field. Previously only `STREAMING` type was kept — now expose all non-streaming links as "Also on" buttons. No additional API calls needed.
- Kitsu: already integrated in `lib/kitsu.ts`. Listed as live on Sources page (Hummingbird.me rebranded to Kitsu).
- menome.in.th: Thai community site with no discoverable public API. Listed as "planned" on Sources page.
- Sources page expanded from 9 to 16 entries in three groups.
- Committed `bf2aa0c` and pushed.

### Session — 2026-06-09 (session 16)
- User wanted Discover sections updated hourly, member/reader counts shown, Popular Anime and New Anime sections added, and X button to dismiss cards and record them for taste profiling.
- Hourly cache key `YYYY-MM-DD-HH` per genre; 5-min interval checks for hour flip.
- Member counts from Jikan `members` field.
- Dismiss writes `direction: 'skip'` to `swipe_history` — same table used by swipe queue, so same RLS applies. Attempted `upsert` with `user_id` but `swipe_history` has no `user_id` column; fixed to plain `insert`.

### Session — 2026-06-09 (session 15)
- Continue Watching was showing FMA instead of actively-watched Saiki K — fixed by ensuring `last_watched_site` is written on every watch event, and the banner always reads the most recently updated entry.
- Platform pill added to Continue Watching header and library card badge. `SITE_DISPLAY`/`SITE_COLORS` maps normalize hostname → display name → colour.

### Session — 2026-06-09 (session 14)
- Extension stats were cumulative across days; user wanted daily reset. Fixed via date key comparison in background.js.
- Extension stats (watch time, episodes, titles, sites) already written to `watch_sessions` table which the Stats page reads. Confirmed flow is connected.
- Added "Your Watch DNA" section to Stats page (mirrors Reading DNA) — genre breakdown, personality label, top titles, re-watch badges.

### Session — 2026-06-09 (session 13)
- User requested manual editing of total chapters/episodes on cards, crowd-sourced so other users see the updated total.
- `community_totals` Supabase table added (upsert keyed by `mal_id + content_type`). Reused `EditableNumber` component. Toast fires when a community total is shared. Add-entry flow back-fills from community on insert.

### Session — 2026-06-09 (sessions 11–12 — continued)
- Multi-type filter: Anime tab includes `has_anime=true` manga entries. typeCounts reflects this.
- Recents live refresh: `visibilitychange` listener re-fetches library on tab focus.
- streaming-sites API auth bug fixed (Bearer + cookie dual-mode).
- Deployment verified via browser automation.

### Session — 2026-06-09 (session 11)
- Extended extension to all major streaming platforms. Fixed Netflix tracking (DOM scrape + API null-episode increment + send() retry).

### Session — 2026-06-08 (session 10)
- Full code review; all Critical/High/Medium findings fixed. 4 deferred (M-4, H-4, H-6, M-1).

### Session — 2026-06-08 (session 9)
- Graphs throughout Stats tab (donuts, trend, heatmap, hour-of-day). OMDB movie-type fix. Vercel cache-bust.

### Session — 2026-06-08 (session 8)
- Extension Connect UX fix. Content-script token harvesting. SET_AUTH_TOKEN handler.

### Session — 2026-06-08 (session 7)
- Date attribution timestamp fix. Cross-device duplicate dismissal. MangaDex chapter listing. OMDB/IMDb rating. Google Takeout import UI.

### Session — 2026-06-08 (session 6)
- Removed auto-sync gauges. Movie filter tab. StudioModal. UrlImportModal close fix.

### Session — 2026-06-08 (session 5)
- SeriesPanel online search; related works add buttons; series-aware episode tracker; FMA patch.

---

## Change History

### 2026-06-09 — Session 19
- `extension/content.js` — YouTube parser: returns null unless title has episode markers
- `app/api/watch-event/route.ts` — `KNOWN_ANIME_SITES` + `isKnownAnimeSite()` guard on auto-create

### 2026-06-09 — Session 18
- `app/api/wikipedia/route.ts` *(new)* — Wikipedia proxy; 72h cache; infobox + arc parsing
- `app/api/notifymoe/route.ts` — 2h null TTL; null upsert on miss
- `app/page.tsx` — Wikipedia collapsible panel in DetailModal
- `app/sources/page.tsx` — Wikipedia added as live source
- `extension/content.js` — Netflix empty-title guard
- `package.json` — `devclean` script
- `.claude/launch.json` — `devclean` in runtimeArgs

### 2026-06-09 — Sessions 13–17
- `lib/notifymoe.ts` *(new)* — notify.moe API client (server-side only)
- `app/api/notifymoe/route.ts` *(new)* — server-side proxy, 24h cache in anilist_cache
- `app/api/community-totals/route.ts` *(new)* — GET/POST for crowd-sourced chapter/episode totals
- `lib/anilist.ts` — `externalLinks` field added to `AniListAnimeData`; non-streaming links exposed
- `lib/supabase.ts` — `last_watched_site: string | null` on Manga type; `SwipeRecord.direction` extended to `'skip'`
- `lib/jikan.ts` — `members` field; `getTopAnime()`; `getNewAnime()`
- `app/page.tsx` — Community totals editing on cards/DetailModal; notify.moe score bars; "Also on" external links; Continue Watching platform pill; card badge shows platform name
- `app/api/watch-event/route.ts` — `last_watched_site` written on match and new-entry insert
- `app/stats/page.tsx` — "Your Watch DNA" section (genre donut, personality, top titles, RE badge)
- `app/sources/page.tsx` — 9 → 16 sources (notify.moe, Kitsu, AniDB, Anime-Planet, Annict, LiveChart, menome.in.th)
- `components/DiscoverySection.tsx` — Full rewrite: 4 sections, hourly cache, member counts, dismiss X

### 2026-06-09 — Sessions 11–12
- `app/page.tsx` — Multi-type filter; `visibilitychange` recents refresh
- `app/api/streaming-sites/route.ts` — Dual-mode auth
- `app/extension/page.tsx` *(new)* — Extension landing page
- `app/sources/page.tsx` — Custom streaming sites section
- `extension/content.js` — Netflix DOM scrape; 6 new platform parsers; `send()` retry
- `extension/background.js` — `fetchCustomSites()`; daily stat reset
- `app/api/watch-event/route.ts` — +1 episode fallback when `safeEpisode == null`
- `components/Nav.tsx` + `components/Sidebar.tsx` — Extension tab

### 2026-06-08 — Sessions 8–9
- `app/stats/page.tsx` — DonutChart + WatchHeatmap; full graph suite
- `extension/content.js` — YOMU-domain token harvesting
- `extension/background.js` — `SET_AUTH_TOKEN` handler
- `extension/popup.js` — polling UX; removed `window.close()`

### 2026-06-08 — Session 6
- `app/page.tsx` — Removed auto-sync gauges; Movie filter; StudioModal; "Similar in your list" clickable
- `components/UrlImportModal.tsx` — `onMouseDown` stopPropagation
- `lib/jikan.ts` — TypeScript fixes

### 2026-06-08 — Sessions 1–5
- Batch-enriched 88 manga entries; dual search; Library Health Check; Re-Watch tracking; `unwatched` status
- Progress snapshots; Title-Case sweep; Calendar; Sync results modal; content-type badges
- Series grouping; SeriesPanel; episode tracker; FMA patch; related works add buttons
