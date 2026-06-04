/**
 * ComicK API client — api.comick.fun
 * Public REST API, no auth required.
 * Covers manga, manhwa, and manhua including many titles that never appear on MAL.
 *
 * NOTE: ComicK blocks some residential/cloud IPs at the network level. The fetch
 * will fail gracefully (caught by the catalog's Promise.allSettled) if unreachable.
 * All functions return [] on failure so the catalog degrades cleanly.
 */

import type { JikanSearchResult } from './jikan'

const COMICK_BASE = 'https://api.comick.fun'

interface ComicKCover { vol: string | null; w: number; h: number; b2key: string }
interface ComicKManga {
  hid: string
  title: string
  slug: string
  country: string           // "jp" | "kr" | "cn" | ...
  status: number            // 1 = ongoing, 2 = completed, 3 = cancelled, 4 = hiatus
  last_chapter: number | null
  links?: Record<string, string>  // { mal?: "123", al?: "456", mu?: "789" }
  md_covers?: ComicKCover[]
  genres?: { genre: string }[]
  desc?: string | null
}

const COMICK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Origin': 'https://comick.io',
  'Referer': 'https://comick.io/',
}

const STATUS_MAP: Record<number, string> = {
  1: 'publishing', 2: 'complete', 3: 'discontinued', 4: 'hiatus',
}

function comickToResult(m: ComicKManga): JikanSearchResult | null {
  // Only include entries with a MAL cross-reference for catalog compatibility
  const malStr = m.links?.mal
  const mal_id = malStr ? parseInt(malStr, 10) : null
  if (!mal_id || isNaN(mal_id)) return null

  const cover = m.md_covers?.[0]
  const cover_url = cover?.b2key
    ? `https://meo.comick.pictures/${cover.b2key}`
    : null

  const genres = (m.genres ?? []).map(g => g.genre).filter(Boolean)
  const status = STATUS_MAP[m.status] ?? null

  return {
    mal_id,
    title: m.title,
    synopsis: m.desc ?? null,
    cover_url,
    genres,
    total_chapters: m.last_chapter ?? null,
    score: null,
    status,
    authors: [],
  }
}

async function comickFetch(path: string): Promise<ComicKManga[]> {
  try {
    const res = await fetch(`${COMICK_BASE}${path}`, {
      headers: COMICK_HEADERS,
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []
    const json = await res.json()
    // ComicK endpoints return either an array directly or { data: [...] }
    return Array.isArray(json) ? json : (json.data ?? json.result ?? [])
  } catch { return [] }
}

/** Weekly trending — all types (manga + manhwa + manhua) */
export async function getComicKTrending(): Promise<JikanSearchResult[]> {
  const items = await comickFetch('/v1.0/top?day=7&limit=100&lang=en')
  return items.map(comickToResult).filter((m): m is JikanSearchResult => m !== null)
}

/** Most-followed manhwa specifically */
export async function getComicKManhwa(): Promise<JikanSearchResult[]> {
  const items = await comickFetch('/v1.0/search?type=manhwa&sort=follow&limit=100&lang=en&page=1')
  return items.map(comickToResult).filter((m): m is JikanSearchResult => m !== null)
}

/** Most-followed manhua specifically */
export async function getComicKManhua(): Promise<JikanSearchResult[]> {
  const items = await comickFetch('/v1.0/search?type=manhua&sort=follow&limit=100&lang=en&page=1')
  return items.map(comickToResult).filter((m): m is JikanSearchResult => m !== null)
}
