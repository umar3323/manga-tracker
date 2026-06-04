/**
 * MangaUpdates (Baka-Updates) API client — api.mangaupdates.com/v1
 * Public REST API, no auth required for reads.
 *
 * Used for on-demand detail modal enrichment:
 *  - anime.start / anime.end  → "Covers: Vol 1, Ch 1 → Vol 27, Ch 108" in suggestion banner
 *  - bayesian_rating          → third community score signal
 *  - recommendations          → community "similar series" picks
 *  - release_frequency        → "Weekly" / "Monthly" / "Irregular" cadence badge
 *  - scanlation_group         → group name badge in detail modal
 *
 * Used in recommend route:
 *  - +2 confidence for entries with active (weekly/biweekly) serialization
 */

const MU_BASE = 'https://api.mangaupdates.com/v1'

export interface MUAnimeAdaptation {
  start: string | null   // "Vol 1, Chap 1 (2003/Brotherhood)"
  end: string | null     // "Vol 27, Chap 108 (Brotherhood)"
}

export interface MURecommendation {
  series_id: number
  series_name: string
  series_url: string
  cover_url: string | null
  weight: number
}

export type MUReleaseFrequency = 'weekly' | 'biweekly' | 'monthly' | 'irregular' | 'completed' | 'unknown'

export interface MUSeriesData {
  series_id: number
  title: string
  url: string
  rating: number | null
  genres: string[]
  latest_chapter: number | null
  status: string | null
  anime: MUAnimeAdaptation
  recommendations: MURecommendation[]
  release_frequency: MUReleaseFrequency
  scanlation_group: string | null
}

/** Derive frequency label from last_updated timestamp */
function deriveFrequency(
  lastUpdatedTs: number | null,
  status: string | null
): MUReleaseFrequency {
  if (status?.toLowerCase().includes('complet')) return 'completed'
  if (!lastUpdatedTs) return 'unknown'
  const daysSince = (Date.now() / 1000 - lastUpdatedTs) / 86400
  if (daysSince <= 14)  return 'weekly'
  if (daysSince <= 45)  return 'biweekly'
  if (daysSince <= 90)  return 'monthly'
  return 'irregular'
}

function parseMuRecord(r: Record<string, unknown>, scanlGroup: string | null): MUSeriesData {
  const animeRaw = r.anime as { start?: string; end?: string } | null
  const lastTs = (r.last_updated as { timestamp?: number } | null)?.timestamp ?? null

  return {
    series_id: r.series_id as number,
    title:     r.title as string,
    url:       (r.url as string) ?? '',
    rating:    (r.bayesian_rating as number | null) ?? null,
    genres:    ((r.genres as { genre: string }[] | null) ?? []).map(g => g.genre),
    latest_chapter: (r.latest_chapter as number | null) ?? null,
    status:    (r.status as string | null) ?? null,
    anime: {
      start: animeRaw?.start ?? null,
      end:   animeRaw?.end ?? null,
    },
    recommendations: ((r.recommendations as {
      series_name: string; series_id: number; series_url: string
      series_image?: { url?: { thumb?: string } }; weight: number
    }[] | null) ?? [])
      .slice(0, 5)
      .map(rec => ({
        series_id: rec.series_id,
        series_name: rec.series_name,
        series_url: rec.series_url,
        cover_url: rec.series_image?.url?.thumb ?? null,
        weight: rec.weight,
      })),
    release_frequency: deriveFrequency(lastTs, (r.status as string | null)),
    scanlation_group: scanlGroup,
  }
}

async function muPost(path: string, body: unknown): Promise<unknown> {
  try {
    const res = await fetch(`${MU_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function muGet(path: string): Promise<unknown> {
  try {
    const res = await fetch(`${MU_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

/** Get latest scanlation group name for a title */
async function getScanlationGroup(title: string): Promise<string | null> {
  const json = await muPost('/releases/search', { search: title, perpage: 3 }) as {
    results?: { record: { title: string; groups?: { name: string }[] } }[]
  } | null
  if (!json?.results?.length) return null
  const groups = json.results[0]?.record?.groups
  return groups?.[0]?.name ?? null
}

/** Search by title, returns full series data with anime depth + scanlation group */
export async function searchMangaUpdates(title: string): Promise<MUSeriesData | null> {
  try {
    const searchJson = await muPost('/series/search', { search: title, perpage: 3 }) as {
      results?: { record: Record<string, unknown> }[]
    } | null
    if (!searchJson?.results?.length) return null

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const needle = norm(title)
    const best = searchJson.results.find(h => norm(h.record.title as string) === needle)
      ?? searchJson.results[0]
    const seriesId = best.record.series_id as number

    // Fetch full record and scanlation group in parallel
    const [detailJson, scanlGroup] = await Promise.all([
      muGet(`/series/${seriesId}`) as Promise<Record<string, unknown> | null>,
      getScanlationGroup(title),
    ])
    if (!detailJson) return null
    return parseMuRecord(detailJson, scanlGroup)
  } catch { return null }
}
