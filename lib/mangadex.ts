/**
 * MangaDex API helpers.
 * Used to find the latest released chapter for ongoing manga,
 * since MAL/Jikan only knows the total for *completed* series.
 *
 * Also exports catalog helpers (getMangaDexPopular, getMangaDexTrending,
 * getMangaDexNewReleases) that return JikanSearchResult-compatible objects
 * for use in the unified catalog / swipe queue / recommendations.
 */

import type { JikanSearchResult } from './jikan'

const MD_BASE = 'https://api.mangadex.org'
const COMMON_PARAMS = 'availableTranslatedLanguage[]=en&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive'

interface MDTag { id: string; attributes: { name: Record<string, string>; group: string } }
interface MDRelationship { id: string; type: string; attributes?: { fileName?: string } }
interface MDManga {
  id: string
  attributes: {
    title: Record<string, string>
    altTitles: Record<string, string>[]
    description: Record<string, string>
    status: string | null
    tags: MDTag[]
    links?: Record<string, string | null> | null
    lastChapter: string | null
  }
  relationships: MDRelationship[]
}

function mdFetch(path: string) {
  return fetch(`${MD_BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'YOMUApp/1.0' },
    signal: AbortSignal.timeout(12000),
  })
}

function mdToResult(m: MDManga): JikanSearchResult | null {
  const attr = m.attributes
  const title =
    attr.title['en'] ?? attr.title['ja-ro'] ??
    Object.values(attr.title)[0] ??
    m.attributes.altTitles.find(a => a['en'])?.['en'] ?? null
  if (!title) return null

  const malRaw = attr.links?.mal
  const mal_id = malRaw ? parseInt(malRaw, 10) : null
  if (!mal_id || isNaN(mal_id)) return null

  const coverRel = m.relationships.find(r => r.type === 'cover_art')
  const cover_url = coverRel?.attributes?.fileName
    ? `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.256.jpg`
    : null

  const genres = attr.tags
    .filter(t => t.attributes.group === 'genre' || t.attributes.group === 'theme')
    .map(t => t.attributes.name['en'] ?? Object.values(t.attributes.name)[0])
    .filter(Boolean) as string[]

  const synopsis = attr.description['en'] ?? Object.values(attr.description)[0] ?? null
  const total_chapters = attr.lastChapter ? parseInt(attr.lastChapter, 10) || null : null

  return { mal_id, title, synopsis, cover_url, genres, total_chapters, score: null, status: attr.status ?? null, authors: [] }
}

async function mdFetchList(query: string): Promise<JikanSearchResult[]> {
  try {
    const res = await mdFetch(`/manga?${query}&${COMMON_PARAMS}&limit=100`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data as MDManga[] ?? [])
      .map(mdToResult)
      .filter((m): m is JikanSearchResult => m !== null)
  } catch { return [] }
}

export async function getMangaDexPopular(): Promise<JikanSearchResult[]> {
  return mdFetchList('order[followedCount]=desc')
}

export async function getMangaDexTrending(): Promise<JikanSearchResult[]> {
  return mdFetchList('order[rating]=desc&status[]=ongoing')
}

export async function getMangaDexNewReleases(): Promise<JikanSearchResult[]> {
  const since = new Date()
  since.setFullYear(since.getFullYear() - 2)
  return mdFetchList(`order[followedCount]=desc&createdAtSince=${since.toISOString().split('T')[0]}`)
}

/** Korean manhwa — previously silently dropped because they often lack MAL IDs on MAL-only sources */
export async function getMangaDexManhwa(): Promise<JikanSearchResult[]> {
  return mdFetchList('order[followedCount]=desc&countryOfOrigin=kr')
}

/** Chinese manhua */
export async function getMangaDexManhua(): Promise<JikanSearchResult[]> {
  return mdFetchList('order[followedCount]=desc&countryOfOrigin=cn')
}



export async function getLatestChapterFromMangaDex(malId: number): Promise<number | null> {
  try {
    // 1. Find the MangaDex manga ID via the MAL external link mapping
    const searchRes = await fetch(
      `https://api.mangadex.org/manga?limit=1&links[mal]=${malId}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!searchRes.ok) return null
    const searchJson = await searchRes.json()
    const mdId: string | undefined = searchJson.data?.[0]?.id
    if (!mdId) return null

    // 2. Get the highest numbered English chapter in the feed
    const feedRes = await fetch(
      `https://api.mangadex.org/manga/${mdId}/feed` +
      `?translatedLanguage[]=en&order[chapter]=desc&limit=10` +
      `&contentRating[]=safe&contentRating[]=suggestive` +
      `&contentRating[]=erotica&contentRating[]=pornographic`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!feedRes.ok) return null
    const feedJson = await feedRes.json()

    let max = 0
    for (const ch of feedJson.data ?? []) {
      const n = parseFloat(ch.attributes?.chapter ?? '0')
      if (!isNaN(n) && n > max) max = n
    }
    return max > 0 ? Math.floor(max) : null
  } catch {
    return null
  }
}
