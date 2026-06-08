# Handoff: Calendar Filters, Sync Enhancements, Content Badges & Add-To-Library

**Date:** 2026-06-07
**Audience:** Developer
**Status:** Complete

---

## Summary

Three feature areas shipped in this session: (1) the "Airing This Week" calendar gained a global anime schedule view with filter pills and an "Add to Library" button; (2) the Sync button now refreshes synopsis, force-refreshes authors/genres/cover on every run; (3) every library card now shows a colour-coded content-type badge (Manga / Manhwa / Webtoon / Manhua / Anime). A full Title-Case sweep was also applied to any remaining lowercase visible strings.

---

## What Changed

- **`components/ReleaseCalendar.tsx`** — Added `onAddToLibrary` prop; "+ Add" cyan button appears on non-library entries in the "All Anime" filter; button changes to "✓ Added" on success; duplicate entries show a toast. Also Title-Cased all empty-state messages.

- **`app/api/airing-schedule-global/route.ts`** *(created)* — GET endpoint hitting Jikan `/schedules?filter={day}` (cached 1 h via `next: { revalidate: 3600 }`). Returns `GlobalAiringEntry[]` with mal_id, title, cover, episodes, score, broadcast_time, genres.

- **`app/api/sync/route.ts`** — Synopsis now refreshed when missing; authors, genres, and cover are force-refreshed on every sync run (not just when empty).

- **`app/page.tsx`** — `ReleaseCalendar` call now passes `watchingMalIds`, `libraryMalIdSet`, and the `onAddToLibrary` handler (inserts with `status: 'watching'`, `content_type: 'anime'`). Content-type badge block updated from "manhwa/webtoon/manhua only" to **all** cards with per-type colours. Remaining lowercase visible strings Title-Cased ("Ep. X Airing In…").

---

## How to Use

### Content-Type Badge
Every card now shows its type label (MANGA / MANHWA / WEBTOON / MANHUA / ANIME) in the card header. Cards without a `content_type` set default to MANGA (zinc/grey). Colours match the filter pills at the top of the library.

### Add To Library From Calendar
1. Open the library page and look at the "Airing This Week" widget.
2. Switch the filter to **All Anime**.
3. Pick a day — a list of all currently-airing anime on that day appears (from Jikan).
4. Entries not already in your library show a cyan **+ Add** button.
5. Clicking inserts the anime with `status = watching`, `content_type = anime`, plus cover, genres, and episode count pre-filled.
6. The button changes to ✓ Added. The card immediately appears in the library (no page reload needed).

### Sync Enhancements
Click **Sync** (header button). For every entry with a MAL ID it now:
- Updates `synopsis` if currently empty
- Force-refreshes `authors`, `genres`, `cover_url` (even if already set — picks up corrections from MAL)
- Updates `total_chapters`, `publishing_status`, `total_episodes` as before

### Deploy Flow (unchanged)
```bash
npm run build
npx vercel pull --yes
npx vercel build --yes
npx vercel deploy --prebuilt
npx vercel alias <preview-url> manga-tracker-hazel.vercel.app
```

---

## Known Limitations & Caveats

- **`manga-tracker-three.vercel.app` vs `manga-tracker-hazel.vercel.app`**: The Vercel project's auto-assigned default domain is `manga-tracker-three` — GitHub auto-deploys go there. `manga-tracker-hazel` is a manual alias updated only by the deploy flow above. Always deploy manually; never assume a GitHub push updated `hazel`. Future plan: promote `hazel` to the project's primary production domain in Vercel Dashboard → Project Settings → Domains.

- **Global schedule caches at the CDN for 1 hour** (`next: { revalidate: 3600 }`). If Jikan updates their airing data mid-day the calendar won't reflect it until the cache expires. This is intentional to avoid hammering Jikan.

- **"All Anime" day-strip dot counts** for days other than the currently-selected one fall back to the user's library count (not global count), because Jikan global data is only fetched for the selected day. Switching days triggers a new Jikan fetch.

- **Add to Library from calendar** uses `anime_mal_id` not `mal_id` (the manga MAL ID field). The card will show in the library but the Sync button won't enrich it from Jikan manga metadata (no manga MAL ID exists for a pure anime entry). The card's `has_anime = true` and `anime_mal_id` are set correctly, so AniList episode data and the airing countdown will work.

- **Sync force-refresh of cover** replaces whatever custom cover the user may have set manually. There is currently no `custom_cover` flag to opt out.

- **Title-Case rule**: All *visible* UI strings should be Title-Cased. Internal values (status codes, precision keys, locale strings like `'en-GB'`, JST timezone labels) are intentionally left lowercase as they are data, not UI text.

---

## Follow-up Steps

- **Promote `manga-tracker-hazel` to primary Vercel domain**: Vercel Dashboard → Project → Settings → Domains → add `manga-tracker-hazel.vercel.app` as a production domain. This makes GitHub auto-deploys update `hazel` directly and removes the need for the manual alias step.
- **Add `score` and `published_from`/`published_to` columns** to `manga_list` and populate them in Sync (Jikan provides `d.score`, `d.published.from`, `d.published.to`). Schema migration needed first.
- **Calendar "past/future episodes"**: currently only `nextAiringEpisode` is shown for library anime. AniList has a full `airingSchedule` connection that could show past and future episodes per series.
- **Sync results modal**: after Sync completes, show a structured modal listing what changed per entry rather than a generic toast.
