# Handoff: Similar Manga, Duplicate Detection, Anime Suggestion & Discovery Tabs

**Date:** 2026-06-04  
**Audience:** Developer  
**Status:** Complete

---

## Summary

Four features added on top of the YOMU rebrand session: the Discover page now has a working tab bar with Similar / New / Updated grids; selecting a card in those grids opens a mini-modal with an Add-to-list action; the DetailModal gains a duplicate-detection banner with a one-click merge; and an anime adaptation suggestion banner appears when AniList knows about an adaptation the user hasn't confirmed yet.

---

## What Changed

- **`app/discover/page.tsx`** — four changes:
  1. Replaced unused `Recommendation` import with `MangaStatus` + `getAnimeAdaptations` from their correct modules.
  2. Added `DiscoverCardModal` component — shown when tapping any card in the grid tabs; lets the user pick a status and add the manga to their list (calls Jikan for adaptations exactly as `RecommendationModal` does on the home page).
  3. Added tab bar JSX (four tabs: Swipe / Similar / New / Updated) rendered above the swipe/grid content area.
  4. Wrapped all swipe-specific JSX in `{activeTab === 'swipe' && …}`; added `{activeTab !== 'swipe' && <DiscoveryGrid … />}` so the three grid tabs render.
  5. `selectedCard` state type changed from `Recommendation` to `JikanSearchResult`.

- **`app/page.tsx`** — DetailModal additions:
  1. **Duplicate detection** — on mount, compares the open manga's title tokens against every other entry in `allManga` using Jaccard similarity (threshold 0.7). If a near-match is found, an amber banner appears offering "Merge (keep best progress)" or "Not a duplicate". Merging keeps the entry with the higher chapter count, picks up the non-null fields from both, then deletes the other row from `manga_list`.
  2. **Anime adaptation suggestion** — after AniList data loads, if `alManga.relations` contains an `ADAPTATION` node of type `ANIME` and `manga.has_anime` is `false`, a violet banner appears: "AniList found [title]. Is this the anime for this manga?" — confirming writes `has_anime=true`, `anime_mal_id`, and `anime_title` to Supabase.

---

## How to Use

### Discover page tabs
Navigate to `/discover`. The tab bar (Swipe / Similar / New / Updated) is at the top. Tap any non-Swipe tab — it lazy-fetches on first visit. Tap a manga card to open the `DiscoverCardModal`; choose a status and tap **+ Add**.

### Duplicate detection
Open any manga from your home list. If a near-duplicate exists, an amber banner appears automatically at the top of the panel — no action needed to trigger it. Click **Merge** to consolidate or **Not a duplicate** to dismiss for the session.

### Anime adaptation suggestion
Open any manga that does not have `has_anime = true`. If AniList's relation graph includes an ADAPTATION→ANIME edge, a violet banner appears. Click **Yes, link it** to save the anime data, or **Not mine** to dismiss. After confirming, reload the modal to see the full anime section.

---

## Known Limitations & Caveats

- **Duplicate detection is session-only.** Dismissing "Not a duplicate" only hides the banner while the modal is open; it will reappear next time the same manga is opened. There is no persisted dismiss flag in the DB.
- **Merge deletes the lower-progress entry permanently.** There is no undo. If the user merges incorrectly, the deleted row cannot be recovered without a Supabase backup restore.
- **Anime suggestion fires on every open** until the user confirms or dismisses — it re-derives from AniList data each mount. If AniList has a wrong adaptation linked, dismissing is also session-only (same limitation as duplicates).
- **AniList cache must be populated.** The adaptation suggestion reads from the `/api/anilist` route which checks `anilist_cache`. If sync has never run for a manga, the cache row doesn't exist and AniList is queried live — subject to the 90 req/min rate limit.
- **Similar tab uses swipe history for genre weighting** — if the user hasn't swiped anything, it falls back to `getTrendingThisYear` rather than a personalised list.
- **`vermillion` Tailwind class** used in `DiscoverCardModal` button — this is a custom utility defined in `globals.css`. Do not replace with a standard Tailwind colour.
- **`watching` status is excluded** from the Add dropdown in `DiscoverCardModal` (same as the existing `RecommendationModal`). It only appears after `has_anime` is confirmed.

---

## Follow-up Steps

| Item | Priority | Notes |
|---|---|---|
| Persist duplicate dismiss (add a `dismissed_duplicates` column or localStorage key) | Low | Currently reappears on every modal open |
| Persist anime suggestion dismiss | Low | Same issue as above |
| Post-merge: refresh `allManga` in parent without full page reload | Medium | Currently closes the modal but the deleted entry stays in local state until next reload |
| Set `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel | High | Chapter alerts won't fire without these (carried over from previous session) |
| Renew GitHub PAT before 2026-07-02 | High | Carried over |
