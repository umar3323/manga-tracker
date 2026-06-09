/**
 * notify.moe client — https://notify.moe
 * Open REST API, no auth required.
 * CORS: blocked for browser requests — server-side only via /api/notifymoe proxy.
 *
 * Provides: community scores (story/visuals/soundtrack/overall), anime ID for deep links.
 */

const BASE = 'https://notify.moe'

export interface NotifyMoeRating {
  overall: number
  story: number
  visuals: number
  soundtrack: number
  overall_count: number
}

export interface NotifyMoeAnime {
  id: string
  title: { canonical: string; english: string | null; japanese: string | null }
  summary: string | null
  type: string | null   // 'TV' | 'Movie' | 'OVA' | 'ONA' | ...
  status: string | null // 'current' | 'finished' | 'upcoming'
  episodeCount: number | null
  episodeLength: number | null
  rating: NotifyMoeRating | null
  url: string          // deep link: https://notify.moe/anime/{id}
  mappings: { service: string; serviceId: string }[]
}

interface RawAnime {
  id: string
  title?: { canonical?: string; english?: string; japanese?: string }
  summary?: string
  type?: string
  status?: string
  episodeCount?: number
  episodeLength?: number
  rating?: {
    overall?: number; story?: number; visuals?: number; soundtrack?: number
    overallCount?: number
  }
  mappings?: { service: string; serviceId: string }[]
}

function mapAnime(a: RawAnime): NotifyMoeAnime {
  return {
    id: a.id,
    title: {
      canonical: a.title?.canonical ?? '',
      english: a.title?.english ?? null,
      japanese: a.title?.japanese ?? null,
    },
    summary: a.summary ?? null,
    type: a.type ?? null,
    status: a.status ?? null,
    episodeCount: a.episodeCount ?? null,
    episodeLength: a.episodeLength ?? null,
    rating: a.rating ? {
      overall: a.rating.overall ?? 0,
      story: a.rating.story ?? 0,
      visuals: a.rating.visuals ?? 0,
      soundtrack: a.rating.soundtrack ?? 0,
      overall_count: a.rating.overallCount ?? 0,
    } : null,
    url: `https://notify.moe/anime/${a.id}`,
    mappings: a.mappings ?? [],
  }
}

/** Find notify.moe anime by MAL ID.
 *  Searches by title, then cross-checks `mappings` for the MAL ID match.
 *  Server-side only (CORS blocked). */
export async function findNotifyMoeByMalId(malId: number, title: string): Promise<NotifyMoeAnime | null> {
  try {
    const res = await fetch(`${BASE}/api/find/anime?query=${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'YOMU/1.0 (manga-tracker)' },
    })
    if (!res.ok) return null
    const results: RawAnime[] = await res.json()
    const malStr = String(malId)
    // Find result that has a myanimelist mapping matching our MAL ID
    const match = results.find(r =>
      r.mappings?.some(m => m.service === 'myanimelist/anime' && m.serviceId === malStr)
    )
    return match ? mapAnime(match) : null
  } catch { return null }
}

/** Fetch by notify.moe internal ID directly. */
export async function getNotifyMoeAnime(notifyId: string): Promise<NotifyMoeAnime | null> {
  try {
    const res = await fetch(`${BASE}/api/anime/${notifyId}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'YOMU/1.0 (manga-tracker)' },
    })
    if (!res.ok) return null
    const data: RawAnime = await res.json()
    return mapAnime(data)
  } catch { return null }
}
