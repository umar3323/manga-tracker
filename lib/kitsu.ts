/**
 * Kitsu API client — kitsu.io/api/edge (JSON:API spec)
 * Public reads, no auth required.
 * Required headers: Accept: application/vnd.api+json
 * CORS: no browser support — server-side only.
 * Rate limit: none published; use 300ms gaps for mapping requests.
 *
 * Roles in YOMU:
 *  1. `getTopManhwa()` — manhwa catalog pool with Kitsu community scores
 *  2. `searchKitsu(title)` + `getKitsuMalId(id)` — ID bridge for non-MAL entries
 *     (ComicK entries missing links.mal, Webtoons series)
 */

import type { JikanSearchResult } from './jikan'

const BASE = 'https://kitsu.io/api/edge'
const HEADERS = {
  Accept: 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
}

interface KitsuAttrs {
  canonicalTitle: string
  synopsis: string | null
  posterImage: { small: string; medium: string } | null
  coverImage:  { small: string; medium: string } | null
  averageRating: string | null  // "85.07" as string (0–100)
  chapterCount: number | null
  status: string | null
  subtype: string | null        // 'manga' | 'manhwa' | 'manhua' | 'oel'
}

export interface KitsuMangaEntry {
  id: string
  attributes: KitsuAttrs
}

async function kitsuGet(path: string): Promise<{ data: KitsuMangaEntry[] } | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

/** Resolve Kitsu manga ID → MAL ID via the mappings endpoint */
export async function getKitsuMalId(kitsuId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${BASE}/mappings?filter[item_type]=Manga&filter[item_id]=${kitsuId}&filter[externalSite]=myanimelist/manga`,
      { headers: HEADERS, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const json = await res.json()
    const externalId: string | undefined = json.data?.[0]?.attributes?.externalId
    if (!externalId) return null
    const n = parseInt(externalId, 10)
    return isNaN(n) ? null : n
  } catch { return null }
}

/** Search Kitsu by title — returns best match with Kitsu ID (for downstream MAL resolution) */
export async function searchKitsu(title: string): Promise<KitsuMangaEntry | null> {
  const json = await kitsuGet(`/manga?filter[text]=${encodeURIComponent(title)}&page[limit]=5`)
  if (!json?.data?.length) return null
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const needle = norm(title)
  return json.data.find(m => norm(m.attributes.canonicalTitle) === needle) ?? json.data[0]
}

export function kitsuToJikanResult(item: KitsuMangaEntry, malId: number | null): JikanSearchResult {
  const a = item.attributes
  const cover_url = a.posterImage?.small ?? a.coverImage?.small ?? null
  const score = a.averageRating ? parseFloat(a.averageRating) / 10 : null
  const sub = a.subtype?.toLowerCase() ?? 'manga'
  const country = sub === 'manhwa' ? 'kr' : sub === 'manhua' ? 'cn' : 'jp'

  return {
    mal_id: malId,
    title: a.canonicalTitle,
    synopsis: a.synopsis ?? null,
    cover_url,
    genres: [],  // Kitsu categories need a separate request; omit for catalog
    total_chapters: a.chapterCount ?? null,
    score,
    status: a.status ?? null,
    authors: [],
    hid: `kitsu:${item.id}`,
    source: 'kitsu',
    country,
  }
}

/** Top manhwa by follower count, enriched with MAL IDs via mappings */
export async function getTopManhwa(): Promise<JikanSearchResult[]> {
  const json = await kitsuGet('/manga?sort=-followersCount&filter[subtype]=manhwa&page[limit]=20')
  if (!json) return []

  const results: JikanSearchResult[] = []
  for (let i = 0; i < json.data.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 300))
    const malId = await getKitsuMalId(json.data[i].id)
    results.push(kitsuToJikanResult(json.data[i], malId))
  }
  return results
}

/** Top manga by follower count — Kitsu community score as tiebreaker */
export async function getKitsuTopManga(): Promise<JikanSearchResult[]> {
  const json = await kitsuGet('/manga?sort=-followersCount&filter[subtype]=manga&page[limit]=20')
  if (!json) return []

  const results: JikanSearchResult[] = []
  for (let i = 0; i < json.data.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 300))
    const malId = await getKitsuMalId(json.data[i].id)
    results.push(kitsuToJikanResult(json.data[i], malId))
  }
  return results
}
