/**
 * Kitsu API client — kitsu.io/api/edge (JSON:API spec)
 * Public read access, no key required.
 *
 * Used for:
 *  1. Additional community score signal in catalog (averageRating)
 *  2. MAL ID bridge: given a Kitsu manga ID, resolve to MAL ID via mappings
 *  3. Trending manhwa/manhua with Kitsu cover art
 *
 * NOTE: Kitsu's bulk manga list doesn't include MAL IDs inline — a second
 * /mappings request is needed per series. For catalog use we only call
 * mappings for the top N entries to stay within reasonable request counts.
 */

import type { JikanSearchResult } from './jikan'

const KITSU_BASE = 'https://kitsu.io/api/edge'

interface KitsuMangaAttrs {
  canonicalTitle: string
  synopsis: string | null
  coverImage: { small: string; medium: string; large: string } | null
  posterImage: { small: string; medium: string; large: string } | null
  averageRating: string | null   // "85.07" as string
  chapterCount: number | null
  status: string | null
  subtype: string | null         // "manga" | "manhwa" | "manhua" | "oel" etc.
  startDate: string | null
}

interface KitsuManga {
  id: string
  attributes: KitsuMangaAttrs
}

interface KitsuResponse {
  data: KitsuManga[]
}

async function kitsufetch(path: string): Promise<KitsuResponse | null> {
  try {
    const res = await fetch(`${KITSU_BASE}${path}`, {
      headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

/** Resolve a Kitsu manga ID → MAL ID via the mappings endpoint */
export async function getKitsuMalId(kitsuMangaId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${KITSU_BASE}/mappings?filter[item_type]=Manga&filter[item_id]=${kitsuMangaId}&filter[externalSite]=myanimelist/manga`,
      { headers: { Accept: 'application/vnd.api+json' }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const json = await res.json()
    const malIdStr: string | undefined = json.data?.[0]?.attributes?.externalId
    return malIdStr ? parseInt(malIdStr, 10) : null
  } catch { return null }
}

function kitsuToResult(item: KitsuManga, malId: number | null): JikanSearchResult | null {
  if (!malId) return null
  const attr = item.attributes
  const cover_url =
    attr.posterImage?.small ??
    attr.coverImage?.small ??
    null
  const score = attr.averageRating ? parseFloat(attr.averageRating) / 10 : null  // Kitsu uses 0-100

  return {
    mal_id: malId,
    title: attr.canonicalTitle,
    synopsis: attr.synopsis ?? null,
    cover_url,
    genres: [],  // Kitsu genres need a separate categories request; omit for catalog
    total_chapters: attr.chapterCount ?? null,
    score,
    status: attr.status ?? null,
    authors: [],
  }
}

/** Top manhwa by follower count, enriched with MAL IDs via mappings (top 20 only) */
export async function getKitsuManhwa(): Promise<JikanSearchResult[]> {
  const json = await kitsufetch('/manga?sort=-followersCount&filter[subtype]=manhwa&page[limit]=20')
  if (!json) return []

  const results: JikanSearchResult[] = []
  const DELAY = 300 // ms between mapping requests

  for (let i = 0; i < json.data.length; i++) {
    const item = json.data[i]
    if (i > 0) await new Promise(r => setTimeout(r, DELAY))
    const malId = await getKitsuMalId(item.id)
    const result = kitsuToResult(item, malId)
    if (result) results.push(result)
  }

  return results
}

/** Top manga (all types) by follower count — uses Kitsu community rating as score signal */
export async function getKitsuTopManga(): Promise<JikanSearchResult[]> {
  const json = await kitsufetch('/manga?sort=-followersCount&filter[subtype]=manga&page[limit]=20')
  if (!json) return []

  const results: JikanSearchResult[] = []
  const DELAY = 300

  for (let i = 0; i < json.data.length; i++) {
    const item = json.data[i]
    if (i > 0) await new Promise(r => setTimeout(r, DELAY))
    const malId = await getKitsuMalId(item.id)
    const result = kitsuToResult(item, malId)
    if (result) results.push(result)
  }

  return results
}
