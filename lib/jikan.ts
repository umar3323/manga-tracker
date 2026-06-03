export interface JikanManga {
  coverUrl: string | null
  totalChapters: number | null
}

export interface JikanAuthor {
  id: number
  name: string
}

export interface JikanSearchResult {
  mal_id: number
  title: string
  synopsis: string | null
  cover_url: string | null
  genres: string[]
  total_chapters: number | null
  score: number | null
  status: string | null
  authors: JikanAuthor[]
}

export interface JikanAnimeAdaptation {
  mal_id: number
  title: string
  episodes: number | null
}

// Genre name → Jikan genre ID mapping
export const GENRE_IDS: Record<string, number> = {
  Action: 1, Adventure: 2, Comedy: 4, Drama: 8, Fantasy: 10,
  Horror: 14, Mystery: 7, Romance: 22, 'Sci-Fi': 24,
  'Slice of Life': 36, Sports: 30, Supernatural: 37, Thriller: 41,
  Shounen: 27, Seinen: 42, Shoujo: 25,
}

async function jikanGet(path: string): Promise<Response> {
  return fetch(`https://api.jikan.moe/v4${path}`)
}

export async function getTopManga(
  filter: 'publishing' | 'bypopularity' | 'favorite',
  limit = 12
): Promise<JikanSearchResult[]> {
  try {
    const res = await jikanGet(`/top/manga?filter=${filter}&limit=${limit}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map(mapMangaResult)
  } catch { return [] }
}

export async function getTrendingThisYear(limit = 12): Promise<JikanSearchResult[]> {
  try {
    const year = new Date().getFullYear()
    const res = await jikanGet(
      `/manga?start_date=${year - 1}-01-01&order_by=members&sort=desc&limit=${limit}&status=publishing`
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map(mapMangaResult)
  } catch { return [] }
}

export async function fetchMangaInfo(title: string): Promise<JikanManga> {
  try {
    const res = await jikanGet(`/manga?q=${encodeURIComponent(title)}&limit=1`)
    if (!res.ok) return { coverUrl: null, totalChapters: null }
    const json = await res.json()
    const item = json.data?.[0]
    if (!item) return { coverUrl: null, totalChapters: null }
    return {
      coverUrl: item.images?.jpg?.image_url ?? null,
      totalChapters: item.chapters ?? null,
    }
  } catch {
    return { coverUrl: null, totalChapters: null }
  }
}

export async function searchManga(query: string, page = 1): Promise<JikanSearchResult[]> {
  try {
    const res = await jikanGet(`/manga?q=${encodeURIComponent(query)}&limit=12&page=${page}&order_by=popularity`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map(mapMangaResult)
  } catch {
    return []
  }
}

export async function getMangaById(malId: number): Promise<JikanSearchResult | null> {
  try {
    const res = await jikanGet(`/manga/${malId}/full`)
    if (!res.ok) return null
    const json = await res.json()
    return json.data ? mapMangaResult(json.data) : null
  } catch {
    return null
  }
}

export async function getAnimeAdaptations(malId: number): Promise<JikanAnimeAdaptation[]> {
  try {
    const res = await jikanGet(`/manga/${malId}/relations`)
    if (!res.ok) return []
    const json = await res.json()
    const adaptations: JikanAnimeAdaptation[] = []
    for (const rel of json.data ?? []) {
      if (rel.relation === 'Adaptation') {
        for (const entry of rel.entry ?? []) {
          if (entry.type === 'anime') {
            // Fetch anime episode count
            try {
              const ar = await fetch(`https://api.jikan.moe/v4/anime/${entry.mal_id}`)
              if (ar.ok) {
                const aj = await ar.json()
                adaptations.push({
                  mal_id: entry.mal_id,
                  title: aj.data?.title ?? entry.name,
                  episodes: aj.data?.episodes ?? null,
                })
              } else {
                adaptations.push({ mal_id: entry.mal_id, title: entry.name, episodes: null })
              }
            } catch {
              adaptations.push({ mal_id: entry.mal_id, title: entry.name, episodes: null })
            }
          }
        }
      }
    }
    return adaptations
  } catch {
    return []
  }
}

export async function getTopMangaByGenres(
  genreIds: number[],
  excludeMalIds: number[],
  limit = 10
): Promise<JikanSearchResult[]> {
  try {
    const genreParam = genreIds.slice(0, 3).join(',')
    const path = genreParam
      ? `/manga?genres=${genreParam}&limit=20&order_by=score&sort=desc`
      : `/top/manga?limit=20`
    const res = await jikanGet(path)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? [])
      .map(mapMangaResult)
      .filter((m: JikanSearchResult) => !excludeMalIds.includes(m.mal_id))
      .slice(0, limit)
  } catch {
    return []
  }
}

function mapMangaResult(item: Record<string, unknown>): JikanSearchResult {
  const genres = [
    ...((item.genres as { name: string }[]) ?? []),
    ...((item.themes as { name: string }[]) ?? []),
  ].map((g) => g.name)

  const authors = ((item.authors as { mal_id: number; name: string }[]) ?? []).map(a => ({
    id: a.mal_id,
    name: a.name,
  }))

  return {
    mal_id: item.mal_id as number,
    title: (item.title as string) ?? 'Unknown',
    synopsis: (item.synopsis as string | null) ?? null,
    cover_url: (item.images as { jpg?: { image_url?: string } })?.jpg?.image_url ?? null,
    genres,
    total_chapters: (item.chapters as number | null) ?? null,
    score: (item.score as number | null) ?? null,
    status: (item.status as string | null) ?? null,
    authors,
  }
}

export async function getAuthorWorks(personId: number): Promise<JikanSearchResult[]> {
  try {
    const res = await jikanGet(`/people/${personId}/manga`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? [])
      .filter((e: { position: string }) =>
        ['Story', 'Art', 'Story & Art'].includes(e.position)
      )
      .map((e: { manga: Record<string, unknown> }) => mapMangaResult(e.manga))
      .filter((m: JikanSearchResult) => m.mal_id)
  } catch {
    return []
  }
}

export async function getAuthorInfo(personId: number): Promise<{ name: string; about: string | null } | null> {
  try {
    const res = await jikanGet(`/people/${personId}/full`)
    if (!res.ok) return null
    const json = await res.json()
    return {
      name: json.data?.name ?? '',
      about: json.data?.about ?? null,
    }
  } catch {
    return null
  }
}
