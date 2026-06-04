/**
 * MangaUpdates (Baka-Updates) API client — api.mangaupdates.com/v1
 * Public REST API, no auth required for reads.
 *
 * Used for on-demand detail modal enrichment:
 *  - anime.start / anime.end → shows "Anime covers through Ch. X" in the suggestion banner
 *  - bayesian_rating → third community score signal
 *  - recommendations → community "similar series" picks
 *  - latest_chapter → accurate ongoing chapter count
 */

const MU_BASE = 'https://api.mangaupdates.com/v1'

export interface MUAnimeAdaptation {
  start: string | null   // e.g. "Vol 1, Chap 1 (2003/Brotherhood)"
  end: string | null     // e.g. "Vol 27, Chap 108 (Brotherhood)"
}

export interface MURecommendation {
  series_id: number
  series_name: string
  series_url: string
  cover_url: string | null
  weight: number  // community vote weight
}

export interface MUSeriesData {
  series_id: number
  title: string
  url: string
  rating: number | null          // bayesian_rating
  genres: string[]
  latest_chapter: number | null
  status: string | null          // e.g. "27 Volumes (Complete)"
  anime: MUAnimeAdaptation
  recommendations: MURecommendation[]
}

function parseMuRecord(r: Record<string, unknown>): MUSeriesData {
  const animeRaw = r.anime as { start?: string; end?: string } | null
  return {
    series_id: r.series_id as number,
    title:     r.title as string,
    url:       r.url as string ?? '',
    rating:    (r.bayesian_rating as number | null) ?? null,
    genres:    ((r.genres as { genre: string }[] | null) ?? []).map(g => g.genre),
    latest_chapter: (r.latest_chapter as number | null) ?? null,
    status:    (r.status as string | null) ?? null,
    anime: {
      start: animeRaw?.start ?? null,
      end:   animeRaw?.end ?? null,
    },
    recommendations: ((r.recommendations as { series_name: string; series_id: number; series_url: string; series_image?: { url?: { thumb?: string } }; weight: number }[] | null) ?? [])
      .slice(0, 5)
      .map(rec => ({
        series_id:   rec.series_id,
        series_name: rec.series_name,
        series_url:  rec.series_url,
        cover_url:   rec.series_image?.url?.thumb ?? null,
        weight:      rec.weight,
      })),
  }
}

/** Search by title, returns the best-matching series record with full detail */
export async function searchMangaUpdates(title: string): Promise<MUSeriesData | null> {
  try {
    // 1. Search for the series
    const searchRes = await fetch(`${MU_BASE}/series/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ search: title, perpage: 3 }),
      signal: AbortSignal.timeout(8000),
    })
    if (!searchRes.ok) return null
    const searchJson = await searchRes.json()
    const hits: { record: Record<string, unknown> }[] = searchJson.results ?? []
    if (!hits.length) return null

    // Pick the closest title match
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const needle = norm(title)
    const best = hits.find(h => norm(h.record.title as string) === needle) ?? hits[0]
    const seriesId = best.record.series_id as number

    // 2. Fetch full record (includes anime, recommendations, status)
    const detailRes = await fetch(`${MU_BASE}/series/${seriesId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!detailRes.ok) return null
    const detail = await detailRes.json()
    return parseMuRecord(detail)
  } catch { return null }
}
