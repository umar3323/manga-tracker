@AGENTS.md

# Skills Library

All skills live at `/Users/hossain/Documents/Claude/Skills/`. Before implementing any task, check whether a relevant skill exists and read its `SKILL.md` before writing any code.

## Required skills for this project

### website-handoff (MANDATORY)
Path: `/Users/hossain/Documents/Claude/Skills/website-handoff/SKILL.md`

Read this skill and follow it **after every implemented change** — any feature, bug fix, style change, refactor, or config update. It maintains `WEBSITE_HANDOFF.md` at the project root. Do not skip this step.

### Other available skills
- `agent-comms` — cross-agent peer review for high-stakes changes
- `handoff-doc` — general handoff/session documentation
- `token-efficient-prompting` — prompting and API cost guidance

For any task not covered above, check `/Users/hossain/Documents/Claude/Skills/` for a relevant skill before proceeding.

---

# CLAUDE.md — YOMU Codebase Navigation

## Entry points
| File | Role |
|---|---|
| `app/page.tsx` | Main library view — 1,969 lines. Owns all library state (manga[], filters, modals open/close). Imports LibraryToolbar, LibraryFilters, LibraryCard, LibraryModals, DetailModal, ReleaseCalendar, TrendingSection, DiscoverySection. |
| `app/layout.tsx` | Root layout — wraps all pages with Nav, Sidebar, ServiceWorkerRegistrar, ExtensionAuthPush, NotificationBell. |
| `middleware.ts` | Next.js middleware — enforces Supabase auth on all routes; exempts `/api/cron/*`, `/api/warmup`, `/api/feature-request`, `/share/*`, and public catalog/external APIs via `isPublicApi`. |
| `app/anime/page.tsx` | Anime-specific library view (separate from manga). Uses `lib/anime-data.ts`. |
| `app/stats/page.tsx` | Stats dashboard — reading velocity, watch DNA, ratings, taste profile, donut + heatmap charts. Heavy sections wrapped in `useMemo`. |
| `app/discover/page.tsx` | Swipe-style discovery feed. Calls `/api/swipe-queue` (AniList GraphQL + Jaccard scoring). |
| `app/search/page.tsx` | Cross-source search (Jikan, AniList, MangaDex, MangaUpdates). |
| `app/shelves/page.tsx` | Custom reading shelves (user-created collections). |
| `app/sources/page.tsx` | Sources & integrations overview (16 entries). |
| `app/extension/page.tsx` | Extension setup + token harvesting page. |
| `app/share/[id]/page.tsx` | Public share view — no auth required (exempted in proxy.ts). |
| `extension/background.js` | MV3 service worker — `chrome.alarms` 1-min flush, offline-first batch sync, DOM scraping for 8+ platforms. Library title cache (`yomu_library_titles`) gates streaming-site tracking. `notifyYomuTabs()` pushes `YOMU_REFRESH_LIBRARY` to open YOMU tabs after confirmed watch events. |
| `extension/content.js` | Content script — injected on streaming sites, detects title/episode, sends to background. |
| `extension/popup.js` | Extension popup UI — shows NOW TRACKING, library stats, quick-add. `chrome.storage.onChanged` listener updates stats live while popup is open. |
| `scripts/migrations.sql` | All Supabase DDL — run this to recreate schema. Includes `match_library_entry` (pg_trgm fuzzy) and `merge_entries` RPCs. |

## Component map
| Component file | What it renders | Called from |
|---|---|---|
| `components/LibraryCard.tsx` | Individual manga/anime library card — cover, title, status badge, chapter/ep tracker, rating, genres, arc badges, notes | `app/page.tsx` grid map |
| `components/LibraryToolbar.tsx` | Top toolbar — Add/Sync/Export/Share/Import/SignOut buttons + mobile menu dropdown | `app/page.tsx` |
| `components/LibraryFilters.tsx` | Type-filter pills + status tab bar + search input + sort selector | `app/page.tsx` |
| `components/LibraryModals.tsx` | 9 modals: AuthorModal, StudioModal, RecommendationModal, RecommendationsListModal, SyncResultsModal, ShelfPicker, ShareModal, TakeoutImportModal, HealthCheckModal | `app/page.tsx` |
| `components/DetailView.tsx` | DetailModal (full entry detail panel, 8 parallel API loads), SeriesPanel, RelationMergeButton, EditableNumber | `app/page.tsx`, `app/anime/page.tsx` |
| `components/ReleaseCalendar.tsx` | 14-day airing schedule — day strip with snap-scroll (mobile), 7-column kanban (desktop), Jikan `/schedules` data | `app/page.tsx` |
| `components/Sidebar.tsx` | Left nav rail — Now Reading hero, streak, weekly stats, Up Next list. Navigation-only (no filters). | `app/layout.tsx` |
| `components/Nav.tsx` | Mobile bottom nav (5 items) | `app/layout.tsx` |
| `components/DiscoverPanel.tsx` | Swipe-queue discover cards with like/dismiss + taste profile | `app/page.tsx` |
| `components/DiscoverySection.tsx` | Popular/New Anime sections with hourly refresh | `app/page.tsx` |
| `components/TrendingSection.tsx` | Genre pill row + trending manga grid | `app/page.tsx` |
| `components/ArcEditor.tsx` | Arc/volume progress editor for a single entry | `components/DetailView.tsx` |
| `components/RereadSection.tsx` | Re-read tracking (chapter_at_start/end, auto-reset) | `components/DetailView.tsx` |
| `components/RewatchSection.tsx` | Re-watch tracking (episodes_at_start/end, auto-reset) | `components/DetailView.tsx` |
| `components/CompletionModal.tsx` | Completion celebration + rating prompt | `app/page.tsx` |
| `components/DateAttributionModal.tsx` | Prompts user to attribute a date delta; "Apply To All" session checkbox | `app/page.tsx` |
| `components/DeepSearchModal.tsx` | Deep cross-source search for a single entry | `app/page.tsx` |
| `components/DuplicateDetector.tsx` | Detects + merges duplicate library entries (order-independent pairKey) | `app/page.tsx` |
| `components/SeriesMapModal.tsx` | Series grouping modal — links related entries into a series | `components/DetailView.tsx` |
| `components/UrlImportModal.tsx` | Import entry from URL (AniList, MAL, etc.) | `app/page.tsx` |
| `components/AnimeLinker.tsx` | Jikan anime search + link to manga entry | `components/DetailView.tsx` |
| `components/AchievementsPanel.tsx` | User badges/achievements display | `app/stats/page.tsx` |
| `components/GenreProfile.tsx` | Aggregate genre distribution chart | `app/stats/page.tsx` |
| `components/NarrativeInsights.tsx` | AI-generated reading insights | `app/stats/page.tsx` |
| `components/HeavyRotation.tsx` | Most-read series highlight | `app/stats/page.tsx` |
| `components/MangaPlusFeed.tsx` | MangaPlus chapter feed for tracked titles | `app/page.tsx` |
| `components/WebtoonsFeed.tsx` | Webtoons feed for tracked titles | `app/page.tsx` |
| `components/MangaFact.tsx` | Random manga fact widget | `app/page.tsx` |
| `components/NotificationBell.tsx` | Chapter notification bell (Web Push) | `app/layout.tsx` |
| `components/ExtensionAuthPush.tsx` | Pushes auth token to Chrome extension on login | `app/layout.tsx` |
| `components/ServiceWorkerRegistrar.tsx` | Registers `public/sw.js` for Web Push | `app/layout.tsx` |
| `components/SessionTimer.tsx` | Active reading/watching session timer | `app/page.tsx` |
| `components/FeatureRequestModal.tsx` | Feature request form → `/api/feature-request` | `app/page.tsx` |

## API routes
| Route | Method | Purpose | Auth required | Cache TTL |
|---|---|---|---|---|
| `/api/achievements` | GET/POST | Evaluate + persist user achievements | yes | none |
| `/api/airing-schedule` | POST | Jikan airing schedule for user's library | yes | none |
| `/api/airing-schedule-global` | GET | Global Jikan airing schedule (all anime) | no | in-memory |
| `/api/analyze-url` | POST | Parse MAL/AniList URL → entry metadata | yes | none |
| `/api/anilist` | GET | AniList GraphQL proxy (manga/anime detail, relations) | yes | 24h DB |
| `/api/ann` | GET | Anime News Network data proxy | yes | 24h |
| `/api/catalog` | GET | AniList popular/seasonal catalog for Discover | no | 1h |
| `/api/community-totals` | GET/POST | Crowd-sourced chapter/episode totals | yes | none |
| `/api/cron/reset-daily` | POST | Daily stats reset (called by Vercel cron) | CRON_SECRET | none |
| `/api/deep-search` | POST | Cross-source metadata enrichment for one entry | yes | none |
| `/api/feature-request` | POST | Submit feature request (public) | no | none |
| `/api/goodreads` | GET | Goodreads genre page scrape | no | 6h |
| `/api/jikan-proxy` | GET | General Jikan v4 proxy with 429 retry (path allowlist) | no | none |
| `/api/jikan-search` | GET | Jikan title search with 30s in-memory cache | no | 30s |
| `/api/mangadex` | GET | MangaDex chapter list proxy | yes | none |
| `/api/mangaplus` | GET | MangaPlus chapter feed scrape | no | 6h |
| `/api/mangaupdates` | GET | MangaUpdates series data proxy | yes | 24h DB |
| `/api/notifymoe` | GET | notify.moe anime data proxy (server-side, 24h cache) | yes | 24h DB |
| `/api/push` | POST | Send Web Push notification to user | yes | none |
| `/api/recommend` | POST | Anthropic Claude AI recommendations (Jikan genre match) | yes | none |
| `/api/shonenjump` | GET | Shonen Jump chapter feed | no | in-memory |
| `/api/streaming-sites` | GET/POST/DELETE | User's custom streaming sites (dual auth: cookie + Bearer) | yes | none |
| `/api/swipe-queue` | GET | AniList discovery queue with Jaccard taste scoring | yes | none |
| `/api/sync` | POST | Sync entry metadata from Jikan (cover, genres, etc.) | yes | none |
| `/api/warmup` | GET | Cron warmup — pre-fetches catalog/feeds (CRON_SECRET) | no | none |
| `/api/anime-check` | GET | Fribb/anime-lists lookup — returns `{ isAnime }` for a title string | public | in-memory 24h |
| `/api/library-titles` | GET | Normalised title list for extension library gate (bug-c fix) | Bearer/cookie | 5 min (private) |
| `/api/parser-configs` | GET | Per-domain parser override configs for extension content.js | public | CDN 1h |
| `/api/watch-event` | POST | Log a watch/read event from extension (idempotent upsert) | Bearer/cookie | none |
| `/api/watch-event/batch` | POST | Batch offline-first watch events (UUID idempotency_key) | Bearer/cookie | none |
| `/api/webtoons` | GET | Webtoons episode feed | no | 24h |
| `/api/wikipedia` | GET | Wikipedia summary + infobox proxy (72h DB cache) | yes | 72h DB |

## Lib / utility files
| File | Exports / purpose |
|---|---|
| `lib/supabase.ts` | `supabase` browser client, `Manga`, `MangaStatus`, `Author`, `AnimeRow` types; all DB types live here |
| `lib/jikan.ts` | `jikanGet()` (routes browser calls through `/api/jikan-proxy`), `fetchMangaInfo`, `searchMangaWithFilters`, `searchAnimeWithFiltersTyped`, `getJikanEpisodes`, `getMangaAllRelations`, `getSeriesEntryDetail`, `GENRE_IDS` |
| `lib/anilist.ts` | `RELATION_LABELS`, AniList GraphQL helpers, `getAniListMangaData`, `getAniListAnimeData`, `getAniListRelations`, `getAniListExternalLinks` |
| `lib/anime-data.ts` | `getStatus()`, `AnimeRow` type, anime-specific status helpers |
| `lib/mangadex.ts` | MangaDex chapter fetch helpers |
| `lib/mangaupdates.ts` | MangaUpdates series data fetch |
| `lib/notifymoe.ts` | notify.moe REST API helpers (server-side only, 24h cache) |
| `lib/kitsu.ts` | `kitsuToJikanResult()` — converts Kitsu API results to JikanSearchResult shape |
| `lib/comick.ts` | `comickToJikanResult()` — converts ComicK results to JikanSearchResult shape |
| `lib/ann.ts` | Anime News Network data helpers |
| `lib/achievements.ts` | `BADGES` constant, achievement evaluation logic |

## Environment variables
| Variable | Feature gated |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All DB operations (required) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All DB operations (required) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin DB writes (sync, cron, push) |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for share links + push subscription |
| `ANTHROPIC_API_KEY` | `/api/recommend` + `/api/deep-search` arc detection. ⚠️ API COST: each call = 1 Claude Haiku request |
| `GEMINI_API_KEY` | `/api/deep-search` Gemini enrichment (synopsis, themes, trivia). Optional — omit to disable. Uses `gemini-2.0-flash` free tier. ⚠️ API COST: free tier has RPM limits; fires in parallel with Claude arc call on every Deep Search. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push subscription (browser) |
| `VAPID_PRIVATE_KEY` | Web Push notification signing (server) |
| `VAPID_EMAIL` | Web Push VAPID contact |
| `CRON_SECRET` | Vercel cron auth — `/api/cron/*` and `/api/warmup` check Bearer header |
| `Google_Sheet_ID` / `GOOGLE_SHEET_ID` | Google Sheets export (code handles both casings) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Sheets service account auth |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_PRIVATE_KEY` | Google Sheets service account key |

## Known issues (fix before shipping)
- `app/stats/page.tsx` — All section IIFEs converted to `useMemo`; file is clean
- `scripts/migrations.sql` — `discover_jaccard_feed` RPC references non-existent `discover_cache` table (dormant, safe to leave)
- `.git/index 2` / `.git/index 3` stale files in repo — repo lives in a synced folder; move to unsynced path to avoid index corruption

## Navigation guide
If working on **library card UI** → read `components/LibraryCard.tsx`
If working on **filters / search / sort** → read `components/LibraryFilters.tsx`
If working on **toolbar buttons** → read `components/LibraryToolbar.tsx`
If working on **modals** (author, studio, share, import, health) → read `components/LibraryModals.tsx`
If working on **detail panel / relations / series** → read `components/DetailView.tsx`
If working on **airing calendar** → read `components/ReleaseCalendar.tsx`
If working on **Jikan API calls** → read `lib/jikan.ts` + `app/api/jikan-proxy/route.ts`
If working on **AniList data** → read `lib/anilist.ts` + `app/api/anilist/route.ts`
If working on **Chrome extension** → read `extension/background.js`, `extension/content.js`, `extension/popup.js`. All extension-facing API routes (`/api/streaming-sites`, `/api/library-titles`, `/api/watch-event`, `/api/watch-event/batch`) must be in `isPublicApi` in `proxy.ts` and must do their own Bearer token auth internally.
If working on **auth / middleware** → read `middleware.ts`
If working on **DB schema / RPCs** → read `scripts/migrations.sql`
If working on **Web Push** → read `app/api/push/route.ts` + `components/ServiceWorkerRegistrar.tsx`
If working on **stats page** → read `app/stats/page.tsx` (warning: still long, use `useMemo` for heavy JSX)
If working on **discovery / swipe** → read `app/api/swipe-queue/route.ts` + `components/DiscoverPanel.tsx`
