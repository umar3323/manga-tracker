import { NextRequest, NextResponse } from 'next/server'

const ANILIST_URL = 'https://graphql.anilist.co'

export interface AiringEntry {
  mal_id: number
  anilist_id: number
  title: string
  cover: string | null
  airingAt: number        // unix timestamp
  episode: number
  timeUntilAiring: number // seconds; negative = already aired
}

export async function POST(req: NextRequest) {
  const { mal_ids }: { mal_ids: number[] } = await req.json()
  if (!mal_ids?.length) return NextResponse.json({ schedule: [] })

  // Deduplicate and cap at 50 to stay within AniList rate limits
  const ids = [...new Set(mal_ids)].slice(0, 50)

  // Fetch ±14 days of airing episodes via airingSchedule connection
  const nowSec = Math.floor(Date.now() / 1000)
  const windowStart = nowSec - 7 * 86400
  const windowEnd   = nowSec + 7 * 86400

  const fields = `
    id
    title { romaji english }
    coverImage { medium }
    nextAiringEpisode { airingAt episode timeUntilAiring }
    airingSchedule(notYetAired: false, perPage: 50) {
      nodes { airingAt episode timeUntilAiring }
    }
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
      if (!media) return
      const title = media.title?.english ?? media.title?.romaji ?? 'Unknown'
      const cover = media.coverImage?.medium ?? null
      const anilist_id: number = media.id

      // Collect all episodes in the ±7-day window
      const nodes: { airingAt: number; episode: number; timeUntilAiring: number }[] =
        media.airingSchedule?.nodes ?? []

      // Also include nextAiringEpisode if not already in nodes
      if (media.nextAiringEpisode) {
        const nae = media.nextAiringEpisode
        if (!nodes.find(n => n.episode === nae.episode)) nodes.push(nae)
      }

      for (const n of nodes) {
        if (n.airingAt < windowStart || n.airingAt > windowEnd) continue
        schedule.push({
          mal_id,
          anilist_id,
          title,
          cover,
          airingAt: n.airingAt,
          episode: n.episode,
          timeUntilAiring: n.airingAt - nowSec,
        })
      }
    })

    // Sort by airing time ascending
    schedule.sort((a, b) => a.airingAt - b.airingAt)

    return NextResponse.json({ schedule })
  } catch {
    return NextResponse.json({ schedule: [] })
  }
}
