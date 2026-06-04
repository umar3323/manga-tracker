/**
 * ComicK API client — api.comick.fun
 * Public REST API, no auth required. Rate limit: treat as 3 req/s; use 250ms gaps.
 *
 * Primary purpose: fixes the MangaDex silent-drop problem — ComicK has its own
 * `hid` system independent of MAL IDs, covering manhwa/manhua that never appear on MAL.
 *
 * Converter: entries WITH links.mal → mal_id set, merged into byMalId catalog map.
 *            entries WITHOUT links.mal → mal_id null, keyed by hid in byHid catalog map.
 *
 * NOTE: ComicK blocks some residential/cloud IPs. Vercel serverless IPs are not blocked.
 * All functions return [] on failure so catalog degrades cleanly.
 */

import type { JikanSearchResult } from './jikan'

const BASE = 'https://api.comick.fun'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Origin': 'https://comick.io',
  'Referer': 'https://comick.io/',
}

export interface ComicKResult {
  hid: string
  slug: string
  title: string
  country: string           // 'jp' | 'kr' | 'cn' | ...
  status: number            // 1=ongoing 2=completed 3=cancelled 4=hiatus
  last_chapter: number | null
  rating: number | null     // 0–10 float
  links?: Record<string, string>  // { mal?, al?, mu?, ap? }
  md_covers?: { vol: string | null; w: number; h: number; b2key: string }[]
  genres?: { genre: string }[]
  desc?: string | null
}

const STATUS_MAP: Record<number, string> = {
  1: 'publishing', 2: 'complete', 3: 'discontinued', 4: 'hiatus',
}

function toCountry(c: string): 'jp' | 'kr' | 'cn' | 'other' {
  if (c === 'jp') return 'jp'
  if (c === 'kr') return 'kr'
  if (c === 'cn') return 'cn'
  return 'other'
}

/** Convert ComicK entry to JikanSearchResult. Non-MAL entries have mal_id: null + hid set. */
export function comickToJikanResult(m: ComicKResult): JikanSearchResult {
  const malStr = m.links?.mal
  const mal_id = malStr ? parseInt(malStr, 10) : null

  const cover = m.md_covers?.[0]
  const cover_url = cover?.b2key ? `https://meo.comick.pictures/${cover.b2key}` : null
  const genres = (m.genres ?? []).map(g => g.genre).filter(Boolean)

  return {
    mal_id: (mal_id && !isNaN(mal_id)) ? mal_id : null,
    title: m.title,
    synopsis: m.desc ?? null,
    cover_url,
    genres,
    total_chapters: m.last_chapter ?? null,
    score: m.rating ?? null,
    status: STATUS_MAP[m.status] ?? null,
    authors: [],
    hid: m.hid,
    source: 'comick',
    country: toCountry(m.country ?? 'jp'),
  }
}

async function comickFetch(path: string): Promise<ComicKResult[]> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json) ? json : (json.data ?? json.result ?? [])
  } catch { return [] }
}

/** Most-popular manga/manhwa/manhua on ComicK (all countries) */
export async function getComicKPopular(): Promise<JikanSearchResult[]> {
  const items = await comickFetch('/v1.0/top?page=1&limit=100&type=all')
  return items.map(comickToJikanResult)
}

/** Weekly trending across all types */
export async function getComicKTrending(): Promise<JikanSearchResult[]> {
  const items = await comickFetch('/v1.0/top?day=7&limit=100&lang=en')
  return items.map(comickToJikanResult)
}

/** Title search — used as an ID bridge for non-MAL entries */
export async function searchComicK(query: string): Promise<ComicKResult[]> {
  const items = await comickFetch(`/v1.0/search?q=${encodeURIComponent(query)}&limit=10`)
  return items
}
