# Handoff: YOMU Rebrand + Post-Launch Features

**Date:** 2026-06-04  
**Audience:** Developer  
**Status:** Complete — live. Two features in-progress (see Follow-up)

---

## Summary

Following the initial full build (see `2026-06-03-manga-tracker-full-build.md`), a second session added a full visual rebrand to "YOMU", several major new features, and started (but did not finish) a discovery page restructure. The app is live and fully functional. Two features are partially implemented in uncommitted changes on disk.

---

## What Changed Since Last Handoff

### YOMU design system (`c268c41`)
- **`app/globals.css`** — full YOMU token set: ink surface scale (`--ink-850` through `--ink-200`), paper foreground, vermillion primary accent (`--vermillion`), cyan secondary, Anton/Hanken Grotesk/Space Mono font stack, shadow tokens, glow utilities, motion easing
- **Tailwind layer** — `@layer utilities` remaps `zinc→ink` and `violet→vermillion` site-wide so all existing components pick up the new palette automatically
- **`components/Sidebar.tsx`** — YOMU wordmark in Osaka Pulse font, vermillion active nav rail, reading progress bar
- **`components/Nav.tsx`** — vermillion active pill (tablet), vermillion bottom bar indicator (mobile)
- **`app/stats/page.tsx`** — vermillion heatmap cells, progress rings, bar charts; cyan for weekly goal
- **`app/layout.tsx`** — uses CSS variables for background/foreground instead of hardcoded Tailwind classes; imports `FeatureRequestButton`
- **`public/fonts/OsakaPulse.otf`** — custom font for YOMU wordmark

### Feature request form (`13a028b`)
- **`components/FeatureRequestModal.tsx`** — floating button (bottom-right), slides up a modal with title/description/category fields
- **`app/api/feature-request/route.ts`** — POSTs to a Google Sheet via service account JWT auth
- **`app/layout.tsx`** — renders `<FeatureRequestButton />` globally

**Env vars needed** (not yet set in Vercel):
- `GOOGLE_SHEET_ID` — the Google Sheet to write to
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — service account email
- `GOOGLE_PRIVATE_KEY` — service account private key (with `\n` as literal `\\n`)

### Trending section genre filter pills (`0080433`)
- **`components/TrendingSection.tsx`** — genre filter chip row above the tab bar; selecting a genre filters the trending results; chips read from `MANGA_GENRES` export in `lib/jikan.ts`

### AniList enrichment layer (`be0cc97`)
- **`lib/anilist.ts`** — GraphQL client: `fetchAniListManga()`, `fetchAniListAnime()`, typed interfaces for relations/tags/recommendations, `RELATION_LABELS` map, `formatCountdown()` helper
- **`app/api/anilist/route.ts`** — GET `?mal_id=X&type=MANGA|ANIME`; checks `anilist_cache` first (24h TTL), fetches from AniList GraphQL if stale, upserts cache. Public read (anon).
- **`app/api/sync/route.ts`** — now also fetches and caches AniList manga + anime data per entry during ⟳ Sync
- **`app/page.tsx` DetailModal** — shows: airing countdown, ranked tags (≥60 relevance, non-spoiler), typed relations graph (horizontal scroll), community recommendations
- **`app/api/recommend/route.ts`** — reads `anilist_cache` to build a tag-weight vector; blends into confidence scoring (+15 points max for tag overlap)

### Watching status (`6d0a093`)
- **`lib/supabase.ts`** — `MangaStatus` now includes `'watching'`
- **`app/page.tsx`** — "Watching" option only appears in the status dropdown when `has_anime = true`; selecting it shows an inline violet prompt: "How many episodes have you watched?"; confirms and saves both `status` and `episodes_watched` in one update
- Stats grid shows a "Watching" tile only when count > 0

### Status grid fix (`c13c00f`)
- **`app/page.tsx`** — stats grid changed to 6 columns on desktop so all 6 statuses (including Watching) fit without wrapping

---

## In-Progress / Uncommitted Work

Two features were partially implemented but **not committed**. Changes exist only in the working tree:

### 1. Discovery page tab restructure (`app/discover/page.tsx` — unstaged)
The discover page was being extended with 4 tabs: Swipe (existing), Similar, New, Updated. The state and lazy-fetch logic were added but the JSX tab bar and grid rendering were not yet written. The file is in a buildable but incomplete state.

### 2. `lib/jikan.ts` additions (unstaged)
Two new functions were added but not committed:
- `getNewSeriesManga(limit, excludeIds)` — manga started in 2025+
- `getUpdatedManga(limit, excludeIds, excludeGenreIds)` — ongoing manga with recent chapters

**To complete these:** Continue from the `handleTabChange` + `DiscoveryGrid` component that was written, then add the JSX tab bar below the discover header, and conditionally render either the swipe UI or `<DiscoveryGrid>` based on `activeTab`.

Also **not yet built** from the requested feature set:
- Duplicate detection + merge in the detail panel
- Uncertain anime adaptation suggestion (from AniList relation data)

---

## Supabase Tables (complete list as of this handoff)

| Table | Notes |
|---|---|
| `manga_list` | Core — includes `status` now accepting `'watching'` |
| `reading_log` | Chapter increments + session duration |
| `swipe_history` | Swipe decisions (genre learning) |
| `arcs` | User arc annotations |
| `rereads` | Re-read log |
| `shelves` + `shelf_manga` | Custom collections |
| `chapter_notifications` | In-app chapter alerts |
| `public_shares` | Public share tokens |
| `anilist_cache` | AniList GraphQL cache (mal_id + type as PK) |

---

## Vercel Environment Variables

| Key | Status | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Set | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Set | |
| `NEXT_PUBLIC_SITE_URL` | ✅ Set | |
| `ANTHROPIC_API_KEY` | ✅ Set | Not currently used (recommendations are Jikan-based) |
| `CRON_SECRET` | ❌ Not set | **Required** for weekly chapter alert cron |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Not set | **Required** for chapter alert cron |
| `GOOGLE_SHEET_ID` | ❌ Not set | Required for feature request form |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ❌ Not set | Required for feature request form |
| `GOOGLE_PRIVATE_KEY` | ❌ Not set | Required for feature request form |

---

## Known Limitations & Caveats

- **GitHub PAT expires 2026-07-02.** Regenerate a classic PAT with `repo` scope before that date.
- **`proxy.ts` not `middleware.ts`.** Next.js 16 uses `proxy` convention with `export async function proxy(...)`.
- **YOMU CSS tokens.** `globals.css` defines `--ink-850`, `--fg-1`, `--vermillion`, etc. Any new components should use these variables rather than hardcoded Tailwind colours, otherwise they won't respect the theme.
- **Osaka Pulse font.** Located at `public/fonts/OsakaPulse.otf`, loaded via `@font-face` in `globals.css`. Used only for the YOMU wordmark in Sidebar — do not apply broadly.
- **AniList rate limit.** 90 requests/minute. The `/api/anilist` route caches for 24h to stay well within this. During sync, AniList calls are throttled alongside Jikan (450ms gaps). Do not add client-side direct calls to AniList — always go through the cache route.
- **Feature request form.** Requires three Google env vars. If missing, the API returns 500 but the modal still renders client-side — users will see an error toast when submitting.
- **Watching status + DB constraint.** The `manga_list.status` column has no check constraint — `'watching'` is enforced at the TypeScript layer only. Any direct SQL inserts with invalid statuses will succeed silently.
- **Unstaged changes.** `app/discover/page.tsx` and `lib/jikan.ts` have uncommitted work. Running `git checkout -- .` will destroy it. Commit or stash before switching branches.

---

## Follow-up Steps

| Item | Priority | Notes |
|---|---|---|
| Commit/complete discover page tab restructure | High | Unstaged — will be lost if discarded |
| Set `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel | High | Chapter alerts won't fire without these |
| Set Google Sheets env vars in Vercel | Medium | Feature request form silently fails without them |
| Renew GitHub PAT before 2026-07-02 | High | |
| Build duplicate detection + merge in detail panel | Medium | Requested but not started |
| Build uncertain anime adaptation suggestion | Medium | Requested, not started — requires reading `alManga.relations` for ADAPTATION type and checking against `has_anime` |
| Run ⟳ Sync to populate AniList cache | Medium | Detail panel AniList sections are empty until sync runs |
