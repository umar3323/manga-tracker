# Handoff: Catalog Expansion, Layout Redesign & Third-Party Integrations

**Date:** 2026-06-04  
**Audience:** Developer  
**Status:** Complete — all commits pushed and live on Vercel

---

## Connected External Services & Websites

Every third-party source wired into YOMU, what it's used for, and how it's accessed.

| Service | URL | How accessed | Used for |
|---|---|---|---|
| **MyAnimeList (via Jikan)** | `https://api.jikan.moe/v4` | REST API (public, no key) | Manga search, metadata, scores, author lookup, anime adaptations |
| **MangaDex** | `https://api.mangadex.org` | REST API (public, no key) | Catalog: 300 manga per refresh (popular, trending, new) + latest chapter lookup |
| **AniList** | `https://graphql.anilist.co` | GraphQL API (public, no key) | Tags, relations, streaming countdown, trending manga catalog, community recommendations |
| **Shonen Jump / Viz** | `https://www.viz.com/shonenjump` | Server-side HTML scrape (1h cache) | Live chapter feed in Discover → Jump tab; SJ series boost in recommendations |
| **Goodreads** | `https://www.goodreads.com` | Server-side HTML scrape (2h / 30min cache) | Trending manga catalog, Western popularity signal, parallel search results |
| **Supabase** | Project URL in `NEXT_PUBLIC_SUPABASE_URL` | Supabase JS SDK + SSR client | Database (all user data), auth, realtime, anilist_cache table |
| **Google Sheets** | Sheet ID in `GOOGLE_SHEET_ID` | REST API via service account JWT | Feature request form submissions |
| **Vercel** | Auto-deploy on push to `main` | GitHub integration | Hosting, serverless API routes, cron jobs |

### Rate limits to be aware of
| Service | Limit | How YOMU handles it |
|---|---|---|
| Jikan | 3 req/s, 60 req/min | 450ms gaps between paginated calls; single-request fallbacks |
| AniList | 90 req/min | 24h cache in `anilist_cache` table; no client-side direct calls |
| MangaDex | 5 req/s, 300 req/min | Parallel fetch at cold start only; 2h in-memory cache |
| Goodreads | No published limit (scraping) | 2h / 30min cache; single fetch per cache period |
| Viz | No published limit (scraping) | 1h in-memory cache |

---

## Summary

Third session since initial build. Added seven distinct features across the session: a layout redesign (sidebar hero, icon rail, floating mobile nav), streaming availability in the detail panel, a Shonen Jump live feed, a greatly expanded manga catalog (400–600 titles via MangaDex + AniList + multi-page Jikan), Goodreads integration in search and recommendations, a "Did You Know?" manga facts widget, and duplicate detection + anime suggestion banners in the detail modal. Everything is deployed.

---

## What Changed

### Layout
- **`components/Sidebar.tsx`** — full redesign: "Now Reading" blurred-cover hero card at top, bento-style stats tiles (weekly chapters + streak), "Up Next" cover strip, slim footer. 260px wide.
- **`components/Nav.tsx`** — tablet nav replaced from top horizontal bar to a left icon rail (68px, `md:flex lg:hidden`); mobile bottom nav changed to floating frosted-glass pill with backdrop blur.
- **`app/layout.tsx`** — moved `<Nav />` inside the flex row so tablet rail renders alongside the sidebar; mobile `pb-24` clears the floating bar.

### Detail Modal (`app/page.tsx`)
- **Duplicate detection** — on open, compares title tokens (Jaccard ≥ 0.7) against all other entries in `allManga`. Amber banner with "Merge (keep best progress)" / "Not a duplicate". Merge keeps higher chapter count, fills gaps, deletes the other row.
- **Anime adaptation suggestion** — after AniList loads, if `relations` contains an `ADAPTATION → ANIME` edge and `has_anime` is false, violet banner appears. Confirm writes `has_anime`, `anime_mal_id`, `anime_title` to Supabase.
- **Streaming availability** — new "Watch the anime on" section using `alAnime.streamingLinks`. Grouped by platform (Netflix, Crunchyroll, Prime, Disney+, etc.) with colour-coded rows. Alternate-region entries shown inline. Tappable links to platform pages.
- **Similar manga from discovery** — existing "Similar in your list" section unchanged; AniList "Community also likes" section already present.

### AniList (`lib/anilist.ts`)
- Added `externalLinks { site url type language }` to `ANIME_QUERY`.
- Added `AniListStreamingLink` interface and `streamingLinks` field to `AniListAnimeData`.
- Added `fetchAniListTrendingManga(pages)` + `aniListToJikanResult()` for catalog use.
- Added `TRENDING_MANGA_QUERY` querying 50 trending manga per page.

### AniList cache route (`app/api/anilist/route.ts`)
- Treats cached ANIME payloads missing `streamingLinks` as stale — forces re-fetch automatically.

### Discover page (`app/discover/page.tsx`)
- Added `⚡ Jump` tab — renders `ShonenJumpFeed` component.
- Added `DiscoverCardModal` — mini-modal when tapping grid cards; lets user pick status and add to list.
- Tab bar now renders for all tabs; swipe content wrapped in `max-w-sm mx-auto` inner div so it stays narrow; grid gets full `max-w-5xl` width.
- Grid columns: `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6`.
- `ShonenJumpFeed`: fetches `/api/shonenjump`, shows chapter rows, green bar + TRACKING badge for library matches, FREE badge for free chapters, All/Tracking filter toggle, Read ↗ and Series links.

### Shonen Jump API (`app/api/shonenjump/route.ts`) — new
- Server-side fetches `viz.com/shonenjump`, parses chapter links by regex (`/shonenjump/[slug]-chapter-[num]/chapter/[id]`).
- Extracts series slug, chapter number, Viz reader URL, series page URL, free vs non-free flag.
- In-memory cache 1h; serves stale on fetch failure.

### Unified Catalog API (`app/api/catalog/route.ts`) — new
- Parallel fetch: Jikan 4 pages (100), MangaDex popular + trending + new (300), AniList trending 2 pages (100), Goodreads genres page (cross-referenced).
- Merges by MAL ID — later sources fill missing cover/synopsis/score.
- Priority: Jikan scores → AniList covers → MangaDex breadth → Goodreads Western signal.
- In-memory cache 2h; any source failure degrades gracefully.
- Returns `{ catalog, sources: { jikan, mangadex, anilist, goodreads }, cachedAt }`.

### MangaDex (`lib/mangadex.ts`) — extended
- Added `getMangaDexPopular()`, `getMangaDexTrending()`, `getMangaDexNewReleases()` — each fetches 100 manga with cover art (MangaDex CDN), MAL IDs from `links.mal`, genres, synopsis.
- Existing `getLatestChapterFromMangaDex()` untouched.

### Jikan (`lib/jikan.ts`) — extended
- Added `getTopMangaMultiPage(pages)` — fetches pages 1–N of MAL top manga with 450ms gaps; deduplicates by MAL ID.

### Swipe queue (`app/api/swipe-queue/route.ts`) — rewritten
- Now pulls from `/api/catalog` instead of a single 25-item Jikan call.
- Scores by genre overlap + rating, shuffles top 60%, returns 15 cards.
- Filters manga heavily weighted toward disliked genres (>60% disliked-genre ratio).

### Recommend route (`app/api/recommend/route.ts`) — rewritten
- Uses `/api/catalog` for candidate pool (hundreds of titles vs old 25–50).
- Fetches `/api/shonenjump` and gives +5 confidence bonus to currently serialising SJ series.
- Removed inline Jikan calls; scoring works on `JikanSearchResult` directly.

### Goodreads API (`app/api/goodreads/route.ts`) — new
- `GET /api/goodreads` — scrapes `goodreads.com/genres/manga`, extracts book cards (title, author, rating, ratings count, cover URL, Goodreads URL). Deduplicates volume entries. Cached 2h.
- `GET /api/goodreads?q=query` — scrapes Goodreads search results (`/search?q={query}+manga`). Cached 30min.
- Both endpoints cross-reference up to 15 results with Jikan by title search (500ms gaps) to fill MAL IDs.

### Search page (`app/search/page.tsx`)
- When a text query is entered, Goodreads search fires in parallel (non-blocking).
- "Also on Goodreads" section renders below main results: cover, title, author, rating, ratings count, Goodreads badge.
- Deduplication: GR results whose MAL ID matches a Jikan result are hidden.
- `addFromGoodreads()`: uses existing MAL ID if enriched; otherwise falls back to live Jikan title search before inserting. Detects anime adaptation as normal.
- "Goodreads ↗" link opens the book page.

### MangaFact widget (`components/MangaFact.tsx`) — new
- 30 curated manga trivia facts, random on load, fade animation on ↻ click.
- Rendered on home page between the status grid and backlog pressure card.

---

## How to Use

```bash
# Local dev
cd "manga-tracker"
npm run dev

# Build check
npx next build

# Deploy (auto on push)
git push origin main
```

**Catalog endpoint** (useful for debugging source counts):
```
GET /api/catalog
→ { catalog: [...], sources: { jikan: N, mangadex: N, anilist: N, goodreads: N }, cachedAt }
```

**Shonen Jump feed:**
```
GET /api/shonenjump
→ { chapters: [{ seriesSlug, title, chapter, vizUrl, seriesUrl, isFree }] }
```

**Goodreads search:**
```
GET /api/goodreads?q=one+piece
→ { books: [{ goodreadsId, title, author, rating, ratingsCount, coverUrl, goodreadsUrl, malId }] }
```

---

## Known Limitations & Caveats

### Duplicate detection / Anime suggestion
- **Session-only dismiss.** "Not a duplicate" and "Not mine" are not persisted — banners reappear every time the modal is opened. No `dismissed_duplicates` table or localStorage key exists yet.
- **Merge is irreversible.** The lower-progress entry is permanently deleted from `manga_list`. No undo, no soft-delete. After merging, the deleted entry stays in client-side `allManga` state until the page reloads.

### Streaming availability
- Existing cached ANIME entries without `streamingLinks` auto-refetch once on next modal open. After that they cache for 24h normally.
- AniList rate limit is 90 req/min. During a heavy sync run + lots of modal opens, the re-fetches could add pressure — stay well within limit in practice but worth watching.

### Catalog / Sources
- **In-memory cache only.** Each Vercel serverless cold start re-fetches all sources. On cold start the catalog request takes 10–20 seconds (4 sources in parallel). Subsequent requests within the 2h window are instant.
- **MangaDex → MAL ID dependency.** MangaDex entries without a `links.mal` field are silently dropped. This filters out manhwa/manhua that aren't on MAL (a meaningful portion of MangaDex's catalog).
- **Jikan rate limit.** Multi-page fetch uses 450ms gaps. If other routes also hit Jikan concurrently (search, sync), the gaps may not be enough — Jikan returns 429s which `getTopMangaMultiPage` handles by breaking early.
- **AniList rate limit.** 90 req/min. The trending query (2 pages) uses 2 requests. Fine in isolation but don't add more pages without checking overall request budget.

### Goodreads
- **No public API.** This is HTML scraping. Goodreads can change their markup at any time and break parsing silently — the route will return an empty `books` array rather than error.
- **Goodreads cover images** use `compressed.photo.goodreads.com` CDN. They render in `<img>` tags with `referrerPolicy="no-referrer"` — if Goodreads adds stricter hotlink protection these will break. The fallback is a grey placeholder.
- **Title cross-reference is lossy.** Japanese-titled entries (e.g. "カグラバチ 11") rarely match Jikan by title search. Only English-titled Goodreads books reliably get MAL IDs. Japanese titles appear in the catalog without a MAL ID and are silently skipped.
- **Goodreads search appends "manga"** to the query. This helps for short queries but can reduce recall for very specific titles.

### Shonen Jump
- Viz may change their URL pattern (`/shonenjump/[slug]-chapter-[num]/chapter/[id]`) — the regex parser would silently return zero results. Check `/api/shonenjump` manually if the Jump tab shows empty.
- Free vs non-free detection is positional (everything before "Fan Favorites" heading in HTML). If Viz reorders page sections this flag could be wrong.

### Layout
- **Tablet rail** is `md:flex lg:hidden` (768–1023px). If a page uses a wide inner container, the rail + sidebar share the left side fine; but very narrow content columns may feel cramped.
- **Mobile bottom padding** is `pb-24`. Pages with very tall footers or bottom-anchored elements should account for this.
- `WebkitBackdropFilter` on the mobile nav pill requires Safari 9+/Chrome 76+ — older browsers get a solid background fallback automatically.

### Env vars still missing in Vercel
| Key | Required for |
|---|---|
| `CRON_SECRET` | Weekly chapter alert cron |
| `SUPABASE_SERVICE_ROLE_KEY` | Chapter alert cron |
| `GOOGLE_SHEET_ID` | Feature request form |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Feature request form |
| `GOOGLE_PRIVATE_KEY` | Feature request form |

---

## Follow-up Steps

| Item | Priority | Notes |
|---|---|---|
| Persist duplicate-dismiss and anime-suggestion-dismiss | Low | Add `dismissed_duplicates` array to `manga_list` or use localStorage with mal_id keys |
| Post-merge: remove deleted entry from client `allManga` state | Medium | Currently requires page reload to disappear |
| Add manhwa/manhua to catalog | Medium | MangaDex drops non-MAL entries; need a secondary ID source (Kitsu?) |
| Goodreads scraper health check | Low | Add a simple `/api/goodreads/health` that returns parsed count; alert if 0 |
| Set missing Vercel env vars | High | `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, Google Sheets vars |
| Renew GitHub PAT before 2026-07-02 | High | Classic PAT with `repo` scope |
| Catalog warm-up on deploy | Low | Add a Vercel deploy hook that pings `/api/catalog` to pre-warm the cache |
