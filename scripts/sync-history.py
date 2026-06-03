#!/usr/bin/env python3
"""
Manga Tracker — Browser History Sync
=====================================
Reads Chrome history, finds manga reading and anime streaming activity,
then updates your Supabase manga_list via the REST API.

Usage:
  python3 scripts/sync-history.py

Requirements:
  pip install requests

Configure:
  Set SUPABASE_URL and SERVICE_ROLE_KEY below, or export as env vars.
"""

import sqlite3, shutil, os, re, sys, json
from collections import defaultdict
from urllib.parse import urlparse, parse_qs

try:
    import requests
except ImportError:
    print("❌  Run: pip install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL     = os.environ.get("SUPABASE_URL",     "https://qbthmlojqmkfzscbisus.supabase.co")
SERVICE_ROLE_KEY = os.environ.get("SERVICE_ROLE_KEY", "")   # set this!

if not SERVICE_ROLE_KEY:
    print("❌  Set SERVICE_ROLE_KEY env var (Supabase → Settings → API → service_role key)")
    sys.exit(1)

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# ── Chrome history location ───────────────────────────────────────────────────
HISTORY_PATHS = [
    os.path.expanduser("~/Library/Application Support/Google/Chrome/Default/History"),
    os.path.expanduser("~/Library/Application Support/Google/Chrome/Profile 1/History"),
    os.path.expanduser("~/.config/google-chrome/Default/History"),
    os.path.expanduser("~/AppData/Local/Google/Chrome/User Data/Default/History"),
]

# ── Site patterns ─────────────────────────────────────────────────────────────
MANGA_DOMAINS = [
    "mangadex.org", "mangaplus.shueisha.co.jp", "webtoons.com",
    "mangafire.to", "mangakakalot.com", "manganato.com", "readmanganato.com",
    "manga4life.com", "mangasee123.com", "viz.com", "tapas.io",
    "mangapill.com", "comick.io", "bato.to", "mangabuddy.com",
    "tcbscans.me", "tcbscans.com", "mangahub.io",
]
ANIME_DOMAINS = [
    "crunchyroll.com", "funimation.com", "hidive.com",
    "9animetv.to", "9anime.to", "zoro.to", "aniwave.to",
    "animixplay.to", "gogoanime", "twist.moe",
]

CHAPTER_PATS = [
    r'(?:chapter|ch|chap)[\s._\-#]*(\d+(?:\.\d+)?)',
    r'\bch[\s._]*(\d+(?:\.\d+)?)\b',
]
EPISODE_PATS = [
    r'(?:episode|ep)[\s._\-#]*(\d+)',
]

def extract_number(text, patterns):
    t = (text or "").lower()
    for p in patterns:
        m = re.search(p, t)
        if m:
            return int(float(m.group(1)))
    return None

def clean_title(title):
    for s in [" - MangaDex","| MangaDex"," - MangaFire","| Webtoons",
              " Online"," - Read"," Manga"," - Crunchyroll"," on Crunchyroll",
              "| ComicK"," - ComicK","| Bato.to"," - Bato.to",
              "Watch ", " online free on 9anime"]:
        title = re.sub(re.escape(s), "", title, flags=re.I).strip()
    title = re.sub(r'\s*[-|]\s*(chapter|ch|episode|ep)[\s#]*\d+.*$', '', title, flags=re.I).strip()
    title = re.sub(r'\s*(chapter|ch|ep|episode)[\s._]*\d+.*$', '', title, flags=re.I).strip()
    title = re.sub(r'^read\s+', '', title, flags=re.I).strip()
    return title or None

def read_history():
    src = next((p for p in HISTORY_PATHS if os.path.exists(p)), None)
    if not src:
        print("❌  Chrome history not found. Is Chrome installed?")
        sys.exit(1)
    tmp = "/tmp/manga_tracker_sync.db"
    shutil.copy2(src, tmp)
    conn = sqlite3.connect(tmp)
    c = conn.cursor()
    domain_filter = " OR ".join([f"url LIKE '%{d}%'" for d in MANGA_DOMAINS + ANIME_DOMAINS])
    c.execute(f"SELECT url,title,last_visit_time FROM urls WHERE ({domain_filter}) ORDER BY last_visit_time DESC LIMIT 20000")
    rows = c.fetchall()
    conn.close()
    return rows

def parse_history(rows):
    manga = defaultdict(lambda: {"max_chapter": 0})
    anime = defaultdict(set)

    for url, title, _ in rows:
        if not title:
            continue
        is_anime = (
            any(d in url for d in ANIME_DOMAINS) and
            not any(d in url for d in MANGA_DOMAINS)
        )
        if is_anime:
            # 9anime: extract show slug and episode id
            m9 = re.search(r'/watch/([a-z0-9\-]+)-\d+', url)
            ep_qs = parse_qs(urlparse(url).query).get("ep", [None])[0]
            if m9 and ep_qs:
                name_m = re.match(r'Watch (.+?) (?:online|Season)', title or "", re.I)
                name = name_m.group(1).strip() if name_m else m9.group(1).replace("-", " ").title()
                anime[name].add(ep_qs)
            else:
                ep = extract_number(title, EPISODE_PATS) or extract_number(url, EPISODE_PATS)
                if ep:
                    name = clean_title(title)
                    if name:
                        anime[name].add(str(ep))
        else:
            ch = extract_number(title, CHAPTER_PATS) or extract_number(url, CHAPTER_PATS)
            if ch and ch > 1:
                name = clean_title(title)
                if name and ch > manga[name]["max_chapter"]:
                    manga[name]["max_chapter"] = ch

    return manga, anime

def get_existing():
    r = requests.get(f"{SUPABASE_URL}/rest/v1/manga_list?select=id,title,current_chapter,has_anime", headers=HEADERS)
    return {e["title"].lower(): e for e in r.json()} if r.ok else {}

def upsert(payload):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/manga_list", headers={**HEADERS, "Prefer": "return=minimal"}, json=payload)
    return r.ok

def main():
    print("📖  Reading Chrome history…")
    rows = read_history()
    print(f"   {len(rows)} manga/anime URLs found")

    manga, anime = parse_history(rows)
    existing = get_existing()

    updates = []
    adds = []

    print(f"\n📚  Manga found: {len(manga)}")
    for title, data in sorted(manga.items(), key=lambda x: -x[1]["max_chapter"]):
        ch = data["max_chapter"]
        key = title.lower()
        if key in existing:
            ex = existing[key]
            if ch > ex["current_chapter"]:
                updates.append({"id": ex["id"], "current_chapter": ch})
                print(f"   ↑ {title}: {ex['current_chapter']} → {ch}")
            else:
                print(f"   ✓ {title}: ch {ch} (up to date)")
        else:
            adds.append({"title": title, "current_chapter": ch, "status": "reading"})
            print(f"   + {title}: ch {ch} (new)")

    print(f"\n🎬  Anime found: {len(anime)}")
    for show, ep_ids in sorted(anime.items(), key=lambda x: -len(x[1])):
        print(f"   {show}: {len(ep_ids)} episodes visited")

    if not updates and not adds:
        print("\n✅  Everything is already up to date.")
        return

    confirm = input(f"\nApply {len(updates)} updates and {len(adds)} additions? [y/N] ").strip().lower()
    if confirm != "y":
        print("Cancelled.")
        return

    for u in updates:
        r = requests.patch(f"{SUPABASE_URL}/rest/v1/manga_list?id=eq.{u['id']}", headers=HEADERS, json={"current_chapter": u["current_chapter"]})
        print(f"{'✓' if r.ok else '✗'} Updated chapter")

    for a in adds:
        ok = upsert(a)
        print(f"{'✓' if ok else '✗'} Added: {a['title']}")

    print("\n✅  Sync complete!")

if __name__ == "__main__":
    main()
