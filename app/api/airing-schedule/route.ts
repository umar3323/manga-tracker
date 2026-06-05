import { NextRequest, NextResponse } from 'next/server'

const ANILIST_URL = 'https://graphql.anilist.co'

export interface AiringEntry {
  mal_id: number
  anilist_id: number
  title: string
  cover: string | null
  airingAt: number        // unix timestamp
  episode: number
  timeUntilAiring: number // seconds
}

export async function POST(req: NextRequest) {
  const { mal_ids }: { mal_ids: number[] } = await req.json()
  if (!mal_ids?.length) return NextResponse.json({ schedule: [] })

  // Deduplicate and cap at 50 to stay within AniList rate limits
  const ids = [...new Set(mal_ids)].slice(0, 50)

  // Build a single batched query using aliases — one request for all anime
  const fields = `
    id
    title { romaji english }
    coverImage { medium }
    nextAiringEpisode { airingAt episode timeUntilAiring }
  `
  const aliases = ids.map((id, i) => `a${i}: Media(idMal: ${id}, type: ANIME) { ${fields} }`).join('\n')
  const query = `query { ${aliases} }`

  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) return NextResponse.json({ schedule: [] })
    const json = await res.json()
    const data = json.data ?? {}

    const schedule: AiringEntry[] = []

    ids.forEach((mal_id, i) => {
      const media = data[`a${i}`]
      if (!media?.nextAiringEpisode) return
      const nae = media.nextAiringEpisode
      schedule.push({
        mal_id,
        anilist_id: media.id,
        title: media.title?.english ?? media.title?.romaji ?? 'Unknown',
        cover: media.coverImage?.medium ?? null,
        airingAt: nae.airingAt,
        episode: nae.episode,
        timeUntilAiring: nae.timeUntilAiring,
      })
    })

    // Sort by airing time ascending
    schedule.sort((a, b) => a.airingAt - b.airingAt)

    return NextResponse.json({ schedule })
  } catch {
    return NextResponse.json({ schedule: [] })
  }
}
