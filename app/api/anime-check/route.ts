import { NextRequest, NextResponse } from 'next/server'

// ── Fribb/anime-lists in-memory cache ────────────────────────────────────
// Fetches the Fribb anime-lists database once per 24 h and keeps a Set of
// normalised title strings (title + title_english + synonyms) in module memory.
// Used by the extension as a fallback when a streaming-platform title misses
// the user's library cache — lets us verify "is this actually an anime?" before
// deciding whether to track it or drop it.
//
// Source: https://github.com/Fribb/anime-lists
// Format: [{ mal_id, title, title_english, synonyms: string[], type, ... }]

interface FribbEntry {
  mal_id?: number
  title?: string
  title_english?: string
  synonyms?: string[]
  type?: string
}

let _titleSet: Set<string> | null = null
let _fetchedAt = 0
const CACHE_TTL = 24 * 60 * 60 * 1000  // 24 h
const FRIBB_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json'

function normalise(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '')
}

async function getTitleSet(): Promise<Set<string>> {
  const now = Date.now()
  if (_titleSet && now - _fetchedAt < CACHE_TTL) return _titleSet

  try {
    const res = await fetch(FRIBB_URL, {
      headers: { 'User-Agent': 'YOMU-Tracker/1.0' },
      // Vercel edge cache — reuse across invocations where possible
      next: { revalidate: 86400 },
    } as RequestInit)

    if (!res.ok) throw new Error(`Fribb fetch failed: ${res.status}`)

    const data: FribbEntry[] = await res.json()
    const set = new Set<string>()

    for (const entry of data) {
      if (entry.title)         set.add(normalise(entry.title))
      if (entry.title_english) set.add(normalise(entry.title_english))
      if (Array.isArray(entry.synonyms)) {
        for (const syn of entry.synonyms) {
          if (syn) set.add(normalise(syn))
        }
      }
    }

    _titleSet  = set
    _fetchedAt = now
    console.log(`[anime-check] Loaded ${set.size} normalised titles from Fribb`)
    return set
  } catch (err) {
    console.error('[anime-check] Failed to load Fribb data:', err)
    // Return stale cache if available, else empty set (fail open — don't block tracking)
    return _titleSet ?? new Set()
  }
}

/**
 * GET /api/anime-check?title=X
 *
 * Returns { isAnime: boolean, cached: boolean } — whether the given title
 * matches a known anime in the Fribb/anime-lists database.
 *
 * Called by the extension when a title on a mixed platform (Netflix, Prime, etc.)
 * misses the user's library cache. If isAnime is true, the extension sends the
 * event to /api/watch-event for a server-side pg_trgm library match attempt.
 *
 * Auth: Bearer token (extension) or session cookie (browser).
 * The endpoint is public in proxy.ts to allow Bearer-only calls.
 */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title')?.trim()
  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }

  const set = await getTitleSet()
  const needle = normalise(title)

  // Exact normalised match
  if (set.has(needle)) {
    return NextResponse.json({ isAnime: true, match: 'exact' })
  }

  // Substring match — catches "Attack on Titan: The Final Season" → "attackontitan"
  // Check both directions: stored title contains needle, or needle contains stored title
  // Only do substring scan if needle is reasonably long (≥6 chars) to avoid false positives
  if (needle.length >= 6) {
    for (const stored of set) {
      if (stored.length >= 4 && (stored.includes(needle) || needle.includes(stored))) {
        return NextResponse.json({ isAnime: true, match: 'substring' })
      }
    }
  }

  return NextResponse.json({ isAnime: false })
}
