const ANILIST_URL = 'https://graphql.anilist.co'

export interface AniListTag {
  name: string
  rank: number
  isMediaSpoiler: boolean
}

export interface AniListRelation {
  relationType: string
  node: {
    id: number
    idMal: number | null
    type: 'MANGA' | 'ANIME'
    title: { romaji: string }
    coverImage: { medium: string | null }
    chapters?: number | null
    status: string | null
    meanScore: number | null
  }
}

export interface AniListRecommendation {
  rating: number
  mediaRecommendation: {
    idMal: number | null
    title: { romaji: string }
    coverImage: { medium: string | null }
    meanScore: number | null
    type: string
  } | null
}

export interface AniListMangaData {
  id: number
  title: { romaji: string; english: string | null }
  relations: AniListRelation[]
  tags: AniListTag[]
  recommendations: AniListRecommendation[]
  meanScore: number | null
  averageScore: number | null
  popularity: number | null
}

export interface AniListAnimeData {
  id: number
  title: { romaji: string; english: string | null }
  nextAiringEpisode: { airingAt: number; episode: number; timeUntilAiring: number } | null
  relations: AniListRelation[]
  tags: AniListTag[]
  meanScore: number | null
}

const MANGA_QUERY = `
query ($idMal: Int) {
  Media(idMal: $idMal, type: MANGA) {
    id
    title { romaji english }
    relations {
      edges {
        relationType
        node { id idMal type title { romaji } coverImage { medium } chapters status meanScore }
      }
    }
    tags { name rank isMediaSpoiler }
    recommendations(perPage: 6) {
      nodes {
        rating
        mediaRecommendation {
          idMal type title { romaji } coverImage { medium } meanScore
        }
      }
    }
    meanScore averageScore popularity
  }
}`

const ANIME_QUERY = `
query ($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) {
    id
    title { romaji english }
    nextAiringEpisode { airingAt episode timeUntilAiring }
    relations {
      edges {
        relationType
        node { id idMal type title { romaji } coverImage { medium } status meanScore }
      }
    }
    tags { name rank isMediaSpoiler }
    meanScore
  }
}`

async function queryAniList(query: string, variables: Record<string, unknown>) {
  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data?.Media ?? null
  } catch { return null }
}

export async function fetchAniListManga(malId: number): Promise<AniListMangaData | null> {
  const data = await queryAniList(MANGA_QUERY, { idMal: malId })
  if (!data) return null
  return {
    id: data.id,
    title: data.title,
    relations: (data.relations?.edges ?? []).map((e: { relationType: string; node: AniListRelation['node'] }) => ({
      relationType: e.relationType,
      node: e.node,
    })),
    tags: (data.tags ?? []).filter((t: AniListTag) => !t.isMediaSpoiler),
    recommendations: (data.recommendations?.nodes ?? []).filter((n: AniListRecommendation) => n.mediaRecommendation),
    meanScore: data.meanScore ?? null,
    averageScore: data.averageScore ?? null,
    popularity: data.popularity ?? null,
  }
}

export async function fetchAniListAnime(malId: number): Promise<AniListAnimeData | null> {
  const data = await queryAniList(ANIME_QUERY, { idMal: malId })
  if (!data) return null
  return {
    id: data.id,
    title: data.title,
    nextAiringEpisode: data.nextAiringEpisode ?? null,
    relations: (data.relations?.edges ?? []).map((e: { relationType: string; node: AniListRelation['node'] }) => ({
      relationType: e.relationType,
      node: e.node,
    })),
    tags: (data.tags ?? []).filter((t: AniListTag) => !t.isMediaSpoiler),
    meanScore: data.meanScore ?? null,
  }
}

// Relation types we care about showing
export const RELATION_LABELS: Record<string, string> = {
  PREQUEL:     'Prequel',
  SEQUEL:      'Sequel',
  SIDE_STORY:  'Side Story',
  SPIN_OFF:    'Spin-off',
  ALTERNATIVE: 'Alternative',
  ADAPTATION:  'Adaptation',
  SOURCE:      'Source',
  PARENT:      'Parent',
}

export function formatCountdown(timeUntilAiring: number): string {
  const d = Math.floor(timeUntilAiring / 86400)
  const h = Math.floor((timeUntilAiring % 86400) / 3600)
  const m = Math.floor((timeUntilAiring % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
