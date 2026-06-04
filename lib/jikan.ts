export interface JikanManga {
  coverUrl: string | null
  totalChapters: number | null
}

export interface JikanAuthor {
  id: number
  name: string
}

export interface JikanSearchResult {
  mal_id: number | null      // null for non-MAL entries (ComicK hid-keyed, Webtoons, etc.)
  title: string
  synopsis: string | null
  cover_url: string | null
  genres: string[]           // required — used by swipe-queue 60% filter
  total_chapters: number | null
  score: number | null
  status: string | null
  authors: JikanAuthor[]
  // Extended fields for multi-source catalog
  hid?: string               // ComicK hash ID (primary key when mal_id is null)
  source?: string            // originating source: 'jikan' | 'mangadex' | 'comick' | 'kitsu' | 'anilist' | 'webtoons'
  country?: 'jp' | 'kr' | 'cn' | 'other'
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

export const MANGA_GENRES: { id: number; name: string }[] = [
  { id: 1,  name: 'Action'       }, { id: 2,  name: 'Adventure'    },
  { id: 4,  name: 'Comedy'       }, { id: 8,  name: 'Drama'         },
  { id: 9,  name: 'Ecchi'        }, { id: 10, name: 'Fantasy'       },
  { id: 13, name: 'Historical'   }, { id: 14, name: 'Horror'        },
  { id: 17, name: 'Martial Arts' }, { id: 19, name: 'Music'         },
  { id: 7,  name: 'Mystery'      }, { id: 22, name: 'Romance'       },
  { id: 24, name: 'Sci-Fi'       }, { id: 23, name: 'School'        },
  { id: 36, name: 'Slice of Life'}, { id: 30, name: 'Sports'        },
  { id: 37, name: 'Supernatural' }, { id: 41, name: 'Thriller'      },
  { id: 40, name: 'Psychological'}, { id: 38, name: 'Military'      },
  { id: 27, name: 'Shounen'      }, { id: 42, name: 'Seinen'        },
  { id: 25, name: 'Shoujo'       }, { id: 43, name: 'Josei'         },
  { id: 35, name: 'Harem'        }, { id: 49, name: 'Isekai'        },
  { id: 46, name: 'Award Winning'}, { id: 65, name: 'Gourmet'       },
]

export interface SearchFilters {
  query?: string
  includeGenres?: number[]
  excludeGenres?: number[]
  status?: 'publishing' | 'complete' | 'hiatus' | 'discontinued' | 'upcoming'
  orderBy?: 'score' | 'members' | 'rank' | 'popularity' | 'chapters' | 'favorites' | 'title'
  sort?: 'asc' | 'desc'
  minScore?: number
  minChapters?: number
  maxChapters?: number
  authorId?: number
  page?: number
}

export async function searchMangaWithFilters(filters: SearchFilters): Promise<JikanSearchResult[]> {
  try {
    // Author-based search: use person's manga works directly
    if (filters.authorId) {
      let works = await getAuthorWorks(filters.authorId)
      if (filters.excludeGenres?.length) {
        const exc = new Set(filters.excludeGenres)
        works = works.filter(m => !m.genres.some(g => {
          const gid = MANGA_GENRES.find(mg => mg.name === g)?.id
          return gid && exc.has(gid)
        }))
      }
      return works
    }

    const p = new URLSearchParams()
    if (filters.query?.trim())           p.set('q',              filters.query.trim())
    if (filters.includeGenres?.length)   p.set('genres',         filters.includeGenres.join(','))
    if (filters.excludeGenres?.length)   p.set('genres_exclude', filters.excludeGenres.join(','))
    if (filters.status)                  p.set('status',         filters.status)
    if (filters.orderBy)                 p.set('order_by',       filters.orderBy)
    if (filters.sort)                    p.set('sort',           filters.sort)
    if (filters.minScore)                p.set('min_score',      String(filters.minScore))
    p.set('limit', '24')
    p.set('page',  String(filters.page ?? 1))
    p.set('sfw', 'false')

    const res = await jikanGet(`/manga?${p.toString()}`)
    if (!res.ok) return []
    const json = await res.json()
    let results = (json.data ?? []).map(mapMangaResult) as JikanSearchResult[]

    // Client-side chapter range filter (Jikan has no min/max chapters param)
    if (filters.minChapters) results = results.filter(m => !m.total_chapters || m.total_chapters >= filters.minChapters!)
    if (filters.maxChapters) results = results.filter(m => !m.total_chapters || m.total_chapters <= filters.maxChapters!)

    return results
  } catch { return [] }
}

export async function searchPeople(name: string): Promise<{ id: number; name: string }[]> {
  try {
    const res = await jikanGet(`/people?q=${encodeURIComponent(name)}&limit=6`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map((p: { mal_id: number; name: string }) => ({
      id: p.mal_id, name: p.name,
    }))
  } catch { return [] }
}

async function jikanGet(path: string): Promise<Response> {
  return fetch(`https://api.jikan.moe/v4${path}`)
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Fetch multiple pages of top manga, deduped, up to `pages` pages of 25 each. */
export async function getTopMangaMultiPage(
  pages = 3,
  excludeMalIds: number[] = []
): Promise<JikanSearchResult[]> {
  const results: JikanSearchResult[] = []
  const seen = new Set<number>(excludeMalIds)
  for (let page = 1; page <= pages; page++) {
    try {
      if (page > 1) await delay(450) // Jikan rate limit
      const res = await jikanGet(`/top/manga?limit=25&page=${page}`)
      if (!res.ok) break
      const json = await res.json()
      for (const item of json.data ?? []) {
        const m = mapMangaResult(item)
        if (m.mal_id && !seen.has(m.mal_id)) { seen.add(m.mal_id); results.push(m) }
      }
    } catch { break }
  }
  return results
}

export async function getTopManga(
  filter: 'publishing' | 'bypopularity' | 'favorite',
  limit = 12,
  excludeGenreIds: number[] = []
): Promise<JikanSearchResult[]> {
  try {
    const p = new URLSearchParams({ filter, limit: String(limit) })
    if (excludeGenreIds.length) p.set('genres_exclude', excludeGenreIds.join(','))
    const res = await jikanGet(`/top/manga?${p.toString()}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map(mapMangaResult)
  } catch { return [] }
}

export async function getTrendingThisYear(limit = 12, excludeGenreIds: number[] = []): Promise<JikanSearchResult[]> {
  try {
    const year = new Date().getFullYear()
    const p = new URLSearchParams({
      start_date: `${year - 1}-01-01`,
      order_by: 'members', sort: 'desc',
      limit: String(limit), status: 'publishing',
    })
    if (excludeGenreIds.length) p.set('genres_exclude', excludeGenreIds.join(','))
    const res = await jikanGet(`/manga?${p.toString()}`)
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
      .filter((m: JikanSearchResult) => m.mal_id !== null && !excludeMalIds.includes(m.mal_id))
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

export async function getNewSeriesManga(limit = 20, excludeMalIds: number[] = []): Promise<JikanSearchResult[]> {
  try {
    const year = new Date().getFullYear()
    const res = await jikanGet(
      `/manga?start_date=${year - 1}-01-01&order_by=members&sort=desc&limit=25&status=publishing`
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? [])
      .map(mapMangaResult)
      .filter((m: JikanSearchResult) => m.mal_id !== null && !excludeMalIds.includes(m.mal_id))
      .slice(0, limit)
  } catch { return [] }
}

export async function getUpdatedManga(limit = 20, excludeMalIds: number[] = [], excludeGenreIds: number[] = []): Promise<JikanSearchResult[]> {
  try {
    // Recently updated ongoing manga, optionally excluding genres
    const p = new URLSearchParams({
      status: 'publishing', order_by: 'members', sort: 'desc', limit: '25',
    })
    if (excludeGenreIds.length) p.set('genres_exclude', excludeGenreIds.join(','))
    const res = await jikanGet(`/manga?${p.toString()}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? [])
      .map(mapMangaResult)
      .filter((m: JikanSearchResult) => m.mal_id !== null && !excludeMalIds.includes(m.mal_id))
      .slice(0, limit)
  } catch { return [] }
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
