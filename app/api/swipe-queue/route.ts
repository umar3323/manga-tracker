import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { JikanSearchResult } from '@/lib/jikan'

export async function GET(req: NextRequest) {
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

    // Excluded IDs: already in library + already swiped
    const { data: addedData } = await supabase.from('manga_list').select('mal_id')
    const addedMalIds = (addedData ?? [])
      .map((r: { mal_id: number | null }) => r.mal_id)
      .filter(Boolean) as number[]

    const { data: swipes } = await supabase
      .from('swipe_history')
      .select('mal_id, direction, genres')
      .order('swiped_at', { ascending: false })
      .limit(500)

    const alreadySwiped = (swipes ?? []).map((s: { mal_id: number }) => s.mal_id)
    const excludeSet = new Set([...addedMalIds, ...alreadySwiped])

    // Build genre preference profile from swipe history
    const genreScore: Record<string, number> = {}
    for (const s of swipes ?? []) {
      const weight = s.direction === 'right' ? 1 : -0.5
      for (const g of s.genres ?? []) {
        genreScore[g] = (genreScore[g] ?? 0) + weight
      }
    }
    const topGenres = Object.entries(genreScore)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name)
    const preferredGenreSet = new Set(topGenres)
    const dislikedGenres = new Set(
      Object.entries(genreScore).filter(([, v]) => v < -1).map(([g]) => g)
    )

    // Fetch unified catalog
    const origin = new URL(req.url).origin
    const catalogRes = await fetch(`${origin}/api/catalog`, { signal: AbortSignal.timeout(30000) })
    let catalog: JikanSearchResult[] = []
    if (catalogRes.ok) {
      const json = await catalogRes.json()
      catalog = json.catalog ?? []
    }

    // Filter out excluded IDs and disliked-genre-heavy manga
    const candidates = catalog.filter(m => {
      if (!m.mal_id || excludeSet.has(m.mal_id)) return false
      if (!m.cover_url) return false // need a cover to show the card
      const dislikedCount = (m.genres ?? []).filter(g => dislikedGenres.has(g)).length
      const totalGenres = (m.genres ?? []).length || 1
      if (dislikedCount / totalGenres > 0.6) return false // mostly disliked genres
      return true
    })

    // Score by genre overlap with user's taste
    const scored = candidates.map(m => {
      const overlap = (m.genres ?? []).filter(g => preferredGenreSet.has(g)).length
      const scoreBonus = (m.score ?? 7) / 10
      return { m, rank: overlap * 3 + scoreBonus }
    })

    // Shuffle top candidates (take top 60% by rank, then randomise)
    scored.sort((a, b) => b.rank - a.rank)
    const topPool = scored.slice(0, Math.max(30, Math.floor(scored.length * 0.6)))
    // Fisher-Yates shuffle
    for (let i = topPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[topPool[i], topPool[j]] = [topPool[j], topPool[i]]
    }

    const queue = topPool.slice(0, 15).map(s => s.m)

    return NextResponse.json({
      queue,
      genreProfile: topGenres.length > 0 ? topGenres : null,
      totalCatalog: catalog.length,
    })
  } catch (err) {
    console.error('swipe-queue error', err)
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 })
  }
}
