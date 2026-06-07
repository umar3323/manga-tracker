import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { JikanSearchResult } from '@/lib/jikan'

export const maxDuration = 30

// Map a raw Jikan manga object to JikanSearchResult
function mapItem(item: Record<string, unknown>): JikanSearchResult | null {
  const mal_id = item.mal_id as number | null
  if (!mal_id) return null
  const images = item.images as Record<string, Record<string, string>> | undefined
  const cover_url = images?.jpg?.large_image_url ?? images?.jpg?.image_url ?? null
  if (!cover_url) return null // swipe cards need a cover
  const genres  = ((item.genres  as { name: string }[] | undefined) ?? []).map(g => g.name)
  const themes  = ((item.themes  as { name: string }[] | undefined) ?? []).map(g => g.name)
  const authors = ((item.authors as { name: string }[] | undefined) ?? []).map(a => ({ id: 0, name: a.name }))
  return {
    mal_id,
    title: (item.title as string) ?? '',
    synopsis: (item.synopsis as string | null) ?? null,
    cover_url,
    genres: [...genres, ...themes],
    total_chapters: (item.chapters as number | null) ?? null,
    score: (item.score as number | null) ?? null,
    status: (item.status as string | null) ?? null,
    authors,
  }
}

async function jikanFetch(path: string): Promise<JikanSearchResult[]> {
  try {
    const res = await fetch(`https://api.jikan.moe/v4${path}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 }, // cache 1h at the edge
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map(mapItem).filter(Boolean) as JikanSearchResult[]
  } catch {
    return []
  }
}

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

    // Supabase reads + Jikan fetches run in parallel
    const [addedRes, swipesRes, topRes, popRes] = await Promise.all([
      supabase.from('manga_list').select('mal_id'),
      supabase.from('swipe_history').select('mal_id, direction, genres').order('swiped_at', { ascending: false }).limit(500),
      jikanFetch('/top/manga?limit=25&page=1'),
      jikanFetch('/top/manga?filter=publishing&limit=25'),
    ])

    const addedMalIds = ((addedRes.data ?? []) as { mal_id: number | null }[])
      .map(r => r.mal_id).filter(Boolean) as number[]
    const swipes = (swipesRes.data ?? []) as { mal_id: number; direction: string; genres: string[] }[]
    const alreadySwiped = swipes.map(s => s.mal_id)
    const excludeSet = new Set([...addedMalIds, ...alreadySwiped])

    // Build genre preference profile
    const genreScore: Record<string, number> = {}
    for (const s of swipes) {
      const weight = s.direction === 'right' ? 1 : -0.5
      for (const g of s.genres ?? []) genreScore[g] = (genreScore[g] ?? 0) + weight
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

    // Deduplicate the two Jikan result sets by mal_id
    const seen = new Set<number>()
    const catalog: JikanSearchResult[] = []
    for (const m of [...topRes, ...popRes]) {
      if (m.mal_id && !seen.has(m.mal_id)) { seen.add(m.mal_id); catalog.push(m) }
    }

    // Filter + score
    const candidates = catalog.filter(m => {
      if (!m.mal_id || excludeSet.has(m.mal_id)) return false
      const dislikedCount = (m.genres ?? []).filter(g => dislikedGenres.has(g)).length
      const totalGenres = (m.genres ?? []).length || 1
      return dislikedCount / totalGenres <= 0.6
    })

    const scored = candidates.map(m => {
      const overlap = (m.genres ?? []).filter(g => preferredGenreSet.has(g)).length
      const scoreBonus = (m.score ?? 7) / 10
      return { m, rank: overlap * 3 + scoreBonus }
    })

    scored.sort((a, b) => b.rank - a.rank)
    const topPool = scored.slice(0, Math.max(25, Math.floor(scored.length * 0.7)))
    // Fisher-Yates shuffle for variety
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
