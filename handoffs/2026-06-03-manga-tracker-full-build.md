# Handoff: Manga Tracker — Full Build

**Date:** 2026-06-03  
**Audience:** Developer  
**Status:** Complete — live at production

---

## Summary

A full-featured personal manga and anime tracker built from scratch in one session: Next.js 16 frontend, Supabase backend, deployed to Vercel. Covers reading progress, anime tracking, discovery, stats, arc annotations, re-read logs, session timing, and public sharing.

---

## Infrastructure

| Service | Detail |
|---|---|
| **Live URL** | https://manga-tracker-hazel.vercel.app |
| **GitHub** | https://github.com/umar3323/manga-tracker |
| **Supabase project** | `manga-tracker` — org: PeanutCoder — ID: `qbthmlojqmkfzscbisus` — region: `eu-west-1` |
| **Supabase URL** | `https://qbthmlojqmkfzscbisus.supabase.co` |
| **Vercel team** | Hossain Umer Imam's projects (Hobby) |

### Supabase tables

| Table | Purpose |
|---|---|
| `manga_list` | Core tracking — title, chapters, status, cover, genres, authors, anime info |
| `reading_log` | Every chapter increment logged with duration (for stats + pace) |
| `swipe_history` | Discover swipe decisions (direction + genres, feeds recommendations) |
| `arcs` | User-defined arc annotations per manga (start/end chapter, tag, notes) |
| `rereads` | Re-read log per manga (number, dates, rating, notes) |
| `shelves` | Named custom collections |
| `shelf_manga` | Junction: shelf ↔ manga_list |
| `chapter_notifications` | In-app alerts when new chapters drop (written by cron) |
| `public_shares` | Public share tokens (opt-in, one row per user) |

All tables have RLS enabled — `auth.role() = 'authenticated'` required except `public_shares` (anon read) and the `get_shared_manga_list()` RPC (security definer, anon-callable with valid token).

---

## What Changed — File Map

### App routes
| File | Purpose |
|---|---|
| `app/page.tsx` | My List — main tracker page (all state lives here) |
| `app/search/page.tsx` | Advanced search with genre/author/status/sort filters |
| `app/discover/page.tsx` | Tinder-style swipe discovery |
| `app/stats/page.tsx` | Reading stats, heatmap, taste profile, personal analytics |
| `app/shelves/page.tsx` | Custom collections / named shelves |
| `app/login/page.tsx` | Magic link login |
| `app/share/[token]/page.tsx` | Public read-only list share (no auth) |

### API routes
| File | Purpose |
|---|---|
| `app/api/recommend/route.ts` | Free Jikan-based recommendations (no AI cost) |
| `app/api/swipe-queue/route.ts` | Generates personalised swipe card queue |
| `app/api/sync/route.ts` | Refreshes metadata from Jikan + MangaDex per MAL ID |
| `app/api/cron/check-chapters/route.ts` | Weekly cron — checks for new chapters, writes notifications |
| `app/auth/callback/route.ts` | Supabase magic link exchange |

### Components
| File | Purpose |
|---|---|
| `components/Nav.tsx` | Top nav (md), bottom nav (mobile), hidden on lg+ (sidebar takes over) |
| `components/Sidebar.tsx` | Persistent left sidebar on lg+: nav, streak, currently reading |
| `components/TrendingSection.tsx` | Trending Now / This Year / All Time shelf |
| `components/ArcEditor.tsx` | Arc annotation editor + timeline bar (in detail panel) |
| `components/RereadSection.tsx` | Re-read log: start, complete with rating/notes, history |
| `components/SessionTimer.tsx` | Floating reading session timer with pause/minimise/log |

### Library
| File | Purpose |
|---|---|
| `lib/supabase.ts` | Supabase browser client + all TypeScript interfaces |
| `lib/jikan.ts` | Jikan API helpers: search, filters, top manga, author lookup, genres |
| `lib/mangadex.ts` | MangaDex API: finds latest chapter for ongoing manga by MAL ID |

### Other
| File | Purpose |
|---|---|
| `proxy.ts` | Auth middleware (Next.js 16 "proxy" convention, not "middleware") |
| `vercel.json` | Cron schedule: `/api/cron/check-chapters` every Monday 9am |
| `public/manifest.json` | PWA manifest |
| `public/icon.svg` | App icon (book spine design) |
| `scripts/sync-history.py` | Local script: reads Chrome SQLite history → updates Supabase |

---

## How to Use

### Run locally
```bash
cd "manga-tracker"
npm install
npm run dev          # http://localhost:3000
```

`.env.local` is already populated — do not commit it.

### Deploy
Push to `main` on GitHub → Vercel auto-deploys. No config needed.

```bash
# Push (PAT required — see Caveats)
git remote set-url origin https://umar3323:<PAT>@github.com/umar3323/manga-tracker.git
git push
git remote set-url origin https://github.com/umar3323/manga-tracker.git  # clean up
```

### Activate chapter alert cron
Add these two env vars in Vercel → Settings → Environment Variables, then redeploy:
- `CRON_SECRET` — any random string (e.g. `manga-cron-2026`)
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Project Settings → API → service_role key

### Run browser history sync (local only)
```bash
pip install requests
SERVICE_ROLE_KEY=<service_role_key> python3 scripts/sync-history.py
```
Reads Chrome history SQLite, finds manga/anime URLs, confirms changes before writing.

### Populate genres (needed for recommendations, mood filter, similar titles)
Hit the **⟳ Sync** button in the app. Fetches genres from Jikan for all manga with a MAL ID. Manga added via Search already get genres on add.

---

## Feature Overview

| Feature | Where |
|---|---|
| Chapter + episode tracking, progress bars, status | My List cards |
| Inline editable chapter/episode numbers (click to type) | My List cards |
| Last read date + pace estimate ("🏁 ~2w") | My List cards |
| Arc annotation + timeline ("📍 Alabasta Arc") | My List cards + detail panel |
| Re-read count badge ("×2 re-read") | My List cards |
| Backlog pressure score (total unread chapters) | My List — above mood filter |
| Mood filter (⚡ Quick / ⚔️ Epic / ☁️ Light / 🌑 Dark / 💥 Action / 💙 Heartfelt) | My List — above filters |
| Status filter, search, sort | My List controls |
| Reading session timer (▶ button on each card) | Floating widget |
| Manga detail drawer (click title) | Right panel on desktop, bottom sheet mobile |
| Arc editor (add/edit/export/import arcs) | Detail panel |
| Re-read tracking (start / complete / rate) | Detail panel |
| Similar titles from your list (genre overlap) | Detail panel |
| Author works modal (click author name) | My List cards |
| Add to shelf (📂 button) | My List cards |
| Delete with confirmation (Yes/No) | My List cards |
| Trending Now / This Year / All Time shelf | Top of My List |
| AI recommendations (free — Jikan-based, not Claude) | ✦ Recommend button |
| Recommendation detail panel (click title) | Opens full Jikan data + Add button |
| Advanced search: genre include/exclude chips, author, status, sort, chapter range | /search |
| MAL XML import, URL quick-add | /search |
| Tinder-style swipe discovery with genre learning | /discover |
| Undo last swipe (4s window) | /discover |
| Stats: heatmap, streak, goal, taste profile, drop-off histogram, genre completion | /stats |
| Custom shelves / collections | /shelves |
| Public share link (opt-in) | 🔗 Share button |
| Auth: magic link via Supabase | /login |
| PWA: installable on iOS/Android | manifest.json |
| ⟳ Sync: refreshes chapters, covers, anime info from Jikan + MangaDex | Header button |
| Browser history sync | scripts/sync-history.py (local) |

---

## Vercel Environment Variables

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qbthmlojqmkfzscbisus.supabase.co` | Set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...` | Set |
| `NEXT_PUBLIC_SITE_URL` | `https://manga-tracker-hazel.vercel.app` | Set |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Set (not currently used — recommendations are free) |
| `CRON_SECRET` | _(not set)_ | **Required** for chapter alert cron |
| `SUPABASE_SERVICE_ROLE_KEY` | _(not set)_ | **Required** for chapter alert cron |

---

## Known Limitations & Caveats

- **GitHub PAT expires 2026-07-02.** After that, `git push` will fail. Generate a new classic PAT with `repo` scope at github.com → Settings → Developer settings → Tokens (classic).
- **`proxy.ts` not `middleware.ts`.** Next.js 16 renamed the middleware file. Any tutorials using `middleware.ts` will not work — use `proxy.ts` with `export async function proxy(...)`.
- **Genres only populate for MAL-linked manga.** Mood filter, similar titles, and recommendations all degrade gracefully but work best after running ⟳ Sync. Manga added manually (not via Search) have empty genres until synced.
- **Jikan rate limit: 3 req/sec.** The sync route adds 450ms delays. A list of 40+ manga takes 2–3 minutes to fully sync — this is expected. Do not add parallel fetching without implementing a proper rate-limit queue.
- **Recommendations are Jikan-based, not Claude.** The Anthropic API key is stored in Vercel but the account ran out of credits. The current recommendation algorithm uses genre overlap + MAL score. To restore Claude recommendations, top up credits at console.anthropic.com and swap the route back.
- **Arc data is manually entered.** No API provides arc boundaries — Jikan, MangaDex, and AniList all lack this. Arc annotations are fully user-defined. Export JSON per manga so you don't lose them.
- **Public share uses a security-definer RPC.** The `get_shared_manga_list()` Postgres function bypasses RLS to serve anonymous readers with a valid token. Do not add sensitive columns to this function's SELECT list.
- **Browser history sync is local-only.** `scripts/sync-history.py` reads Chrome's SQLite file — it can only run on the user's machine, not from Vercel. It needs `pip install requests` and the Supabase service role key.
- **MangaDex lookup is best-effort.** `getLatestChapterFromMangaDex()` maps MAL ID → MangaDex ID via the `links[mal]` filter. If a manga isn't on MangaDex or has no MAL link, it silently returns `null`.
- **Session timer logging double-counts if chapters were manually incremented during the session.** The timer pre-fills "chapters read" with the chapter difference; if you also used +/− buttons during the session, those were already logged. Override the input before submitting to avoid duplication.
- **`AGENTS.md` warning in repo root.** The file says "This is NOT the Next.js you know" — this refers to Next.js 16 having breaking changes vs older versions. Keep this file in place; it prevents Claude Code from using stale patterns.

---

## Follow-up Steps

| Item | Priority | Notes |
|---|---|---|
| Set `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel | High | Activates weekly chapter alerts |
| Renew GitHub PAT before 2026-07-02 | High | Same process as initial PAT setup |
| Run ⟳ Sync to populate genres | Medium | Unlocks mood filter, similar titles, better recommendations |
| Top up Anthropic credits (optional) | Low | Restores Claude-powered recommendations if preferred over Jikan-based |
| Chapter release velocity feature | Low | Not built — "Dandadan releases every ~7 days, you're 0 days behind" |
| Emotional tagging per manga | Low | Not built — how does this manga make you feel? (Comfy / Hype / Stressful) |
| Reading order playlists | Low | Not built — sequence Plan to Read deliberately |
