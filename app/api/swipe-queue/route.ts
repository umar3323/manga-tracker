import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getTopMangaByGenres, GENRE_IDS } from '@/lib/jikan'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      }
    )

    // Get already-added MAL IDs
    const { data: addedData } = await supabase
      .from('manga_list')
      .select('mal_id')
    const addedMalIds = (addedData ?? [])
      .map((r: { mal_id: number | null }) => r.mal_id)
      .filter(Boolean) as number[]

    // Get swipe history
    const { data: swipes } = await supabase
      .from('swipe_history')
      .select('mal_id, direction, genres')
      .order('swiped_at', { ascending: false })
      .limit(200)

    const alreadySwiped = (swipes ?? []).map((s: { mal_id: number }) => s.mal_id)
    const excludeIds = [...new Set([...addedMalIds, ...alreadySwiped])]

    // Build genre preference profile
    const genreScore: Record<string, number> = {}
    for (const s of swipes ?? []) {
      const weight = s.direction === 'right' ? 1 : -0.5
      for (const g of s.genres ?? []) {
        genreScore[g] = (genreScore[g] ?? 0) + weight
      }
    }

    // Pick top 3 positively-scored genres
    const topGenres = Object.entries(genreScore)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)

    const genreIds = topGenres
      .map(g => GENRE_IDS[g])
      .filter(Boolean) as number[]

    const queue = await getTopMangaByGenres(genreIds, excludeIds, 10)

    return NextResponse.json({
      queue,
      genreProfile: topGenres.length > 0 ? topGenres : null,
    })
  } catch (err) {
    console.error('swipe-queue error', err)
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 })
  }
}
