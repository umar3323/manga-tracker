# YOMU Watch Tracker — Chrome Extension

Automatically tracks your anime watch stats across **any** streaming site and syncs them to your YOMU library.

## What it tracks

| Data | Detail |
|---|---|
| **Episodes watched** | Auto-increments when you reach 85%+ of an episode |
| **Hours watched** | Accumulates real video play time (not just page visits) |
| **Watch sessions** | Per-episode log: site, duration, timestamp |
| **Status changes** | `Plan To Read` / `Unwatched` → `Watching` automatically |
| **Auto-completion** | Sets status to `Completed` when last episode watched |
| **New anime** | Creates a library card if the title isn't in your library yet |

## Sites supported

aniwaves.ru · GogoAnime · Aniwatch/Zoro/HiAnime · 9anime · Crunchyroll · Funimation · HiDive · Netflix · Amazon Prime Video · **and any other site** (generic video + title parser as fallback)

## Install

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder (this folder)
5. The YOMU Tracker icon appears in your toolbar

## Connect to YOMU

1. Click the YOMU Tracker extension icon
2. Click **Connect to YOMU** — this opens `manga-tracker-hazel.vercel.app`
3. Log in (if not already)
4. The extension picks up your auth token automatically
5. The popup dot turns **green** — you're connected

The connection persists until you log out of YOMU or click Disconnect.

## How it works

The extension injects a tiny content script into every tab. When it finds a `<video>` element playing for longer than 3 minutes:

1. Parses the anime title + episode number from the URL and page title
2. Sends a heartbeat every 30 seconds with accumulated watch time
3. Fires a "complete" event when you reach 85% of the video duration
4. The background worker deduplicates and sends to `/api/watch-event` on YOMU
5. YOMU fuzzy-matches the title to your library (threshold: 65% similarity)
6. Updates `episodes_watched`, `total_watch_time_minutes`, `last_read_at`, `status`

## Offline / not logged in

Events are queued locally (up to 100) and flushed automatically next time you visit YOMU while logged in.

## Troubleshooting

- **"Not connected"**: Click the icon → Connect to YOMU → log in on the tab that opens
- **Title not matched**: The title on the streaming site might differ significantly from your library entry. Check the popup to see what title was detected, then rename the library entry to match.
- **Episodes not incrementing**: Make sure you watch past 85% of the episode (or let it end naturally)
