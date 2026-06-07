import { NextRequest, NextResponse } from 'next/server'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export interface GlobalAiringEntry {
  mal_id: number
  title: string
  cover: string | null
  episodes: number | null
  score: number | null
  broadcast_day: string
  broadcast_time: string | null
  genres: string[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dayParam = searchParams.get('day')
  const day = dayParam && DAY_NAMES.includes(dayParam) ? dayParam : DAY_NAMES[new Date().getDay()]

  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/schedules?filter=${day}&sfw=false&limit=25`,
      {
        signal: AbortSignal.timeout(10000),
        next: { revalidate: 3600 }, // Cache for 1 hour — schedules don't change mid-day
      }
    )
    if (!res.ok) return NextResponse.json({ entries: [], day })

    const json = await res.json()
    const entries: GlobalAiringEntry[] = ((json.data ?? []) as Record<string, unknown>[]).map(a => ({
      mal_id: a.mal_id as number,
      title: (a.title_english as string | null) || (a.title as string) || 'Unknown',
      cover: ((a.images as Record<string, Record<string, string>> | null)?.jpg?.image_url) ?? null,
      episodes: (a.episodes as number | null) ?? null,
      score: (a.score as number | null) ?? null,
      broadcast_day: day,
      broadcast_time: ((a.broadcast as Record<string, string> | null)?.time) ?? null,
      genres: ((a.genres as { name: string }[] | null) ?? []).map(g => g.name),
    }))

    return NextResponse.json({ entries, day })
  } catch {
    return NextResponse.json({ entries: [], day })
  }
}
