// Module version: 2026-06-08
export interface JikanManga {
  coverUrl: string | null
  totalChapters: number | null
  synopsis: string | null
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
  published_from?: string    // ISO date string for start of publication
  media_type?: 'manga' | 'anime' | 'movie'  // explicitly set when result comes from anime endpoint
  episodes?: number | null        // anime only — parallel to total_chapters for manga
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

export type SearchResult =
  | { ok: true;  results: JikanSearchResult[] }
  | { ok: false; reason: 'mal_unavailable' | 'network_error' | 'no_results' }

/**
 * Returns a typed result so callers can distinguish between "genuinely no
 * results", "MAL/Jikan is down (504)", and "network error".
 */
export async function searchMangaWithFiltersTyped(filters: SearchFilters): Promise<SearchResult> {
  try {
    if (filters.authorId) {
      let works = await getAuthorWorks(filters.authorId)
      if (filters.excludeGenres?.length) {
        const exc = new Set(filters.excludeGenres)
        works = works.filter(m => !m.genres.some(g => {
          const gid = MANGA_GENRES.find(mg => mg.name === g)?.id
          return gid && exc.has(gid)
        }))
      }
      return { ok: true, results: works }
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

    // 503/504 → MAL is down; distinguish from genuine empty results
    if (res.status === 503 || res.status === 504) return { ok: false, reason: 'mal_unavailable' }
    if (!res.ok) return { ok: false, reason: 'network_error' }

    const json = await res.json()

    // Proxy forwards Jikan error payloads with status codes embedded
    if (json.status === 504 || json.type === 'BadResponseException') {
      return { ok: false, reason: 'mal_unavailable' }
    }

    let results = (json.data ?? []).map(mapMangaResult) as JikanSearchResult[]
    if (filters.minChapters) results = results.filter(m => !m.total_chapters || m.total_chapters >= filters.minChapters!)
    if (filters.maxChapters) results = results.filter(m => !m.total_chapters || m.total_chapters <= filters.maxChapters!)

    return { ok: true, results }
  } catch {
    return { ok: false, reason: 'network_error' }
  }
}

/** Legacy shim — callers that don't need error distinction. */
export async function searchMangaWithFilters(filters: SearchFilters): Promise<JikanSearchResult[]> {
  const r = await searchMangaWithFiltersTyped(filters)
  return r.ok ? r.results : []
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
  // When running in the browser, route /manga?q=... and /anime?q=... through
  // our server-side proxy which handles 429 retries and 30 s caching.
  if (typeof window !== 'undefined' && (path.startsWith('/manga?') || path.startsWith('/anime?'))) {
    const isAnime = path.startsWith('/anime?')
    const prefix = isAnime ? '/anime?' : '/manga?'
    const jikanParams = new URLSearchParams(path.slice(prefix.length))
    const proxyParams = new URLSearchParams()
    jikanParams.forEach((v, k) => proxyParams.set(k, v))
    if (isAnime) proxyParams.set('type', 'anime')
    const proxyUrl = `/api/jikan-search?${proxyParams.toString()}`
    const res = await fetch(proxyUrl)
    if (!res.ok) return res
    const json = await res.json()
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return fetch(`https://api.jikan.moe/v4${path}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAnimeResult(a: any): JikanSearchResult {
  return {
    mal_id:         a.mal_id ?? null,
    title:          a.title_english ?? a.title ?? '',
    synopsis:       a.synopsis ?? null,
    cover_url:      a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
    genres:         (a.genres ?? []).map((g: { name: string }) => g.name),
    total_chapters: null,
    episodes:       a.episodes ?? null,
    score:          a.score ?? null,
    status:         a.status ?? null,
    authors:        (a.studios ?? []).slice(0, 2).map((s: { mal_id: number; name: string }) => ({ id: s.mal_id, name: s.name })),
    source:         'jikan',
    media_type:     a.type === 'Movie' ? 'movie' : 'anime',
  }
}

/**
 * Search anime via Jikan — returns typed result so callers can distinguish
 * MAL-down (504) from genuine empty/network errors.
 */
export async function searchAnimeWithFiltersTyped(
  filters: Pick<SearchFilters, 'query' | 'orderBy' | 'sort' | 'page'>
): Promise<SearchResult> {
  try {
    const p = new URLSearchParams()
    if (filters.query?.trim()) p.set('q', filters.query.trim())
    p.set('order_by', filters.orderBy ?? 'score')
    p.set('sort',     filters.sort    ?? 'desc')
    p.set('limit', '12')
    p.set('page',  String(filters.page ?? 1))
    p.set('sfw', 'false')

    const res = await jikanGet(`/anime?${p.toString()}`)
    if (res.status === 503 || res.status === 504) return { ok: false, reason: 'mal_unavailable' }
    if (!res.ok) return { ok: false, reason: 'network_error' }

    const json = await res.json()
    if (json.status === 504 || json.type === 'BadResponseException') {
      return { ok: false, reason: 'mal_unavailable' }
    }

    const results: JikanSearchResult[] = (json.data ?? []).map(mapAnimeResult)
    return { ok: true, results }
  } catch {
    return { ok: false, reason: 'network_error' }
  }
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
    if (!res.ok) return { coverUrl: null, totalChapters: null, synopsis: null }
    const json = await res.json()
    const item = json.data?.[0]
    if (!item) return { coverUrl: null, totalChapters: null, synopsis: null }
    return {
      coverUrl: item.images?.jpg?.image_url ?? null,
      totalChapters: item.chapters ?? null,
      synopsis: item.synopsis ?? null,
    }
  } catch {
    return { coverUrl: null, totalChapters: null, synopsis: null }
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

export async function getNewManga(limit = 12, genreId: number | null = null): Promise<JikanSearchResult[]> {
  try {
    const p = new URLSearchParams({
      order_by: 'start_date', sort: 'desc',
      status: 'publishing', limit: String(limit),
    })
    if (genreId) p.set('genres', String(genreId))
    const res = await jikanGet(`/manga?${p.toString()}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map(mapMangaResult)
  } catch { return [] }
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

  const published = item.published as { prop?: { from?: { year?: number; month?: number; day?: number } } } | undefined
  const pf = published?.prop?.from
  const published_from = (pf?.year && pf?.month && pf?.day)
    ? `${pf.year}-${String(pf.month).padStart(2, '0')}-${String(pf.day).padStart(2, '0')}`
    : undefined

  return {
    mal_id: (item.mal_id as number | null | undefined) ?? null,
    title: (item.title as string) ?? 'Unknown',
    synopsis: (item.synopsis as string | null) ?? null,
    cover_url: (item.images as { jpg?: { image_url?: string } })?.jpg?.image_url ?? null,
    genres,
    total_chapters: (item.chapters as number | null) ?? null,
    score: (item.score as number | null) ?? null,
    status: (item.status as string | null) ?? null,
    authors,
    published_from,
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

// ─── Series relations ──────────────────────────────────────────────────────

export interface SeriesRelation {
  relation: string          // 'Prequel' | 'Sequel' | 'Adaptation' | 'Side story' | etc.
  mal_id:   number
  type:     'manga' | 'anime'
  name:     string
  url:      string
}

/** Returns ALL relations for a manga (not just anime adaptations). */
export async function getMangaAllRelations(malId: number): Promise<SeriesRelation[]> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/manga/${malId}/relations`)
    if (!res.ok) return []
    const json = await res.json()
    const out: SeriesRelation[] = []
    for (const rel of json.data ?? []) {
      for (const entry of rel.entry ?? []) {
        out.push({
          relation: rel.relation as string,
          mal_id:   entry.mal_id,
          type:     entry.type === 'anime' ? 'anime' : 'manga',
          name:     entry.name,
          url:      entry.url,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

export interface SeriesEntryDetail {
  cover_url:  string | null
  year:       number | null
  episodes:   number | null
  chapters:   number | null
  status:     string | null
  score:      number | null
}

/** Fetch lightweight detail (cover + year + count) for a related entry. */
export async function getSeriesEntryDetail(
  malId: number,
  type: 'manga' | 'anime',
): Promise<SeriesEntryDetail | null> {
  try {
    let res = await fetch(`https://api.jikan.moe/v4/${type}/${malId}`)
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1200))
      res = await fetch(`https://api.jikan.moe/v4/${type}/${malId}`)
    }
    if (!res.ok) return null
    const d = (await res.json()).data
    if (!d) return null
    const coverRaw = d.images?.jpg?.large_image_url ?? d.images?.jpg?.image_url ?? null
    const yearRaw  =
      type === 'manga'
        ? (d.published?.from ? new Date(d.published.from).getFullYear() : null)
        : (d.year ?? (d.aired?.from ? new Date(d.aired.from).getFullYear() : null))
    return {
      cover_url: coverRaw,
      year:      yearRaw,
      episodes:  type === 'anime' ? (d.episodes ?? null) : null,
      chapters:  type === 'manga' ? (d.chapters ?? null) : null,
      status:    d.status ?? null,
      score:     d.score ?? null,
    }
  } catch {
    return null
  }
}

export async function searchAnimeByProducer(producerId: number): Promise<JikanSearchResult[]> {
  try {
    const res = await jikanGet(`/anime?producers=${producerId}&limit=12&order_by=score&sort=desc`)
    if (!res.ok) return []
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (json.data ?? []).map((a: any) => mapAnimeResult(a))
  } catch {
    return []
  }
}

export async function getJikanRecommendations(malId: number, type: 'anime' | 'manga'): Promise<JikanSearchResult[]> {
  try {
    const res = await jikanGet(`/${type}/${malId}/recommendations`)
    if (!res.ok) return []
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (json.data ?? []).slice(0, 8).map((rec: { entry: any }) => ({
      mal_id: rec.entry.mal_id ?? null,
      title: rec.entry.title ?? 'Unknown',
      cover_url: rec.entry.images?.jpg?.image_url ?? null,
      synopsis: null,
      genres: [],
      total_chapters: null,
      episodes: rec.entry.episodes ?? null,
      media_type: type,
      score: null,
      status: null,
      authors: [],
    }))
  } catch {
    return []
  }
}

export interface JikanEpisode {
  mal_id: number
  title: string | null
  aired: string | null
  score: number | null
  filler: boolean
  recap: boolean
}

export async function getJikanEpisodes(malId: number, page = 1): Promise<{ episodes: JikanEpisode[]; hasNext: boolean }> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`)
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1200))
      const retry = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`)
      if (!retry.ok) return { episodes: [], hasNext: false }
      const json = await retry.json()
      return parseEpisodesResponse(json)
    }
    if (!res.ok) return { episodes: [], hasNext: false }
    const json = await res.json()
    return parseEpisodesResponse(json)
  } catch {
    return { episodes: [], hasNext: false }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEpisodesResponse(json: any): { episodes: JikanEpisode[]; hasNext: boolean } {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    episodes: (json.data ?? []).map((e: any): JikanEpisode => ({
      mal_id: e.mal_id,
      title: e.title_romanji ?? e.title ?? null,
      aired: e.aired ?? null,
      score: e.score ?? null,
      filler: e.filler ?? false,
      recap: e.recap ?? false,
    })),
    hasNext: json.pagination?.has_next_page ?? false,
  }
}

export async function getJikanEpisodeSynopsis(malId: number, episodeId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes/${episodeId}`)
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1200))
      const retry = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes/${episodeId}`)
      if (!retry.ok) return null
      const json = await retry.json()
      return json.data?.synopsis ?? null
    }
    if (!res.ok) return null
    const json = await res.json()
    return json.data?.synopsis ?? null
  } catch {
    return null
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

// ── MangaDex chapter listing ─────────────────────────────────────────────────

export interface MangaDexChapter {
  id: string
  chapter: string | null   // chapter number string e.g. "42"
  title: string | null     // chapter title if set
  volume: string | null
  publishedAt: string | null
  pages: number | null
}

/** Proxy fetch through our Next.js route to avoid CORS on MangaDex. */
async function mdxFetch(mdxPath: string): Promise<Response> {
  return fetch(`/api/mangadex?path=${encodeURIComponent(mdxPath)}`)
}

/** Search MangaDex for a manga by title and return the first result's ID. */
async function getMangaDexId(title: string): Promise<string | null> {
  try {
    const res = await mdxFetch(
      `/manga?title=${encodeURIComponent(title)}&limit=1&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`,
    )
    if (!res.ok) return null
    const json = await res.json()
    return json.data?.[0]?.id ?? null
  } catch {
    return null
  }
}

/** Fetch English chapter list for a MangaDex manga ID (paginated). */
async function getMangaDexChaptersByMangaId(mangaDexId: string, offset = 0): Promise<{ chapters: MangaDexChapter[]; total: number }> {
  try {
    const params = new URLSearchParams({
      'translatedLanguage[]': 'en',
      limit: '96',
      offset: String(offset),
      'order[chapter]': 'asc',
      'order[updatedAt]': 'desc',
    })
    const res = await mdxFetch(`/manga/${mangaDexId}/feed?${params}`)
    if (!res.ok) return { chapters: [], total: 0 }
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chapters: MangaDexChapter[] = (json.data ?? []).map((c: any): MangaDexChapter => ({
      id: c.id,
      chapter: c.attributes?.chapter ?? null,
      title: c.attributes?.title ?? null,
      volume: c.attributes?.volume ?? null,
      publishedAt: c.attributes?.publishAt ?? null,
      pages: c.attributes?.pages ?? null,
    }))
    // Dedupe by chapter number (keep first occurrence)
    const seen = new Set<string>()
    const deduped = chapters.filter(c => {
      const key = c.chapter ?? c.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return { chapters: deduped, total: json.total ?? deduped.length }
  } catch {
    return { chapters: [], total: 0 }
  }
}

/** Public: search by title then return chapters. Returns null if no match found. */
export async function getMangaDexChapters(title: string, offset = 0): Promise<{ chapters: MangaDexChapter[]; total: number } | null> {
  const id = await getMangaDexId(title)
  if (!id) return null
  return getMangaDexChaptersByMangaId(id, offset)
}
