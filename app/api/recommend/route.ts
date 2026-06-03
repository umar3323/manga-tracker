import { NextResponse } from 'next/server'

export interface Recommendation {
  title: string
  mal_id: number | null
  confidence: number   // 0–100
  reason: string
  isAnime: boolean
}

interface MangaEntry {
  title: string
  current_chapter: number
  status: string
  genres?: string[]
  mal_id?: number
}

async function jikanGet(path: string) {
  const res = await fetch(`https://api.jikan.moe/v4${path}`, {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  return res.json()
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: Request) {
  try {
    const { manga, likedGenres = [] }: { manga: MangaEntry[]; likedGenres?: string[] } = await req.json()

    // Build genre preference profile from user's list + liked genres from swipes
    const genreScore: Record<string, number> = {}
    const addedMalIds = new Set<number>(manga.map(m => m.mal_id).filter(Boolean) as number[])
    const addedTitles = new Set(manga.map(m => m.title.toLowerCase()))

    // Weight genres from the user's own list (reading/completed = higher weight)
    for (const m of manga) {
      const weight = m.status === 'reading' ? 2 : m.status === 'completed' ? 1.5 : 1
      for (const g of m.genres ?? []) {
        genreScore[g] = (genreScore[g] ?? 0) + weight
      }
    }
    // Boost genres from swipe history
    for (const g of likedGenres) {
      genreScore[g] = (genreScore[g] ?? 0) + 1.5
    }

    // Top 3 genres by score
    const topGenres = Object.entries(genreScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)

    // Jikan genre ID map for common genres
    const GENRE_IDS: Record<string, number> = {
      Action: 1, Adventure: 2, Comedy: 4, Drama: 8, Fantasy: 10,
      Horror: 14, Mystery: 7, Romance: 22, 'Sci-Fi': 24,
      'Slice of Life': 36, Sports: 30, Supernatural: 37, Thriller: 41,
      Shounen: 27, Seinen: 42, Shoujo: 25,
    }

    const genreIds = topGenres.map(g => GENRE_IDS[g]).filter(Boolean)

    // Fetch candidates from Jikan — try genre-filtered first, fall back to top manga
    let candidates: Record<string, unknown>[] = []
    if (genreIds.length > 0) {
      const j = await jikanGet(`/manga?genres=${genreIds.slice(0, 2).join(',')}&limit=25&order_by=score&sort=desc`)
      candidates = j?.data ?? []
    }
    if (candidates.length < 10) {
      await delay(400)
      const j2 = await jikanGet('/top/manga?limit=25')
      const extra: Record<string, unknown>[] = j2?.data ?? []
      const existingIds = new Set(candidates.map(c => c.mal_id))
      candidates = [...candidates, ...extra.filter(e => !existingIds.has(e.mal_id))]
    }

    // Filter out manga already in user's list
    const filtered = candidates.filter(c => {
      if (addedMalIds.has(c.mal_id as number)) return false
      if (addedTitles.has(String(c.title ?? '').toLowerCase())) return false
      return true
    })

    const userGenreSet = new Set(Object.keys(genreScore).filter(g => genreScore[g] > 0))

    // Score each candidate
    const scored = filtered.map(c => {
      const cGenres = [
        ...((c.genres as { name: string }[]) ?? []),
        ...((c.themes as { name: string }[]) ?? []),
      ].map(g => g.name)

      const overlap = cGenres.filter(g => userGenreSet.has(g))
      const jaccardScore = overlap.length / Math.max(userGenreSet.size, cGenres.length, 1)

      // Normalise Jikan score (0–10) + genre overlap into 55–92
      const jikanScore = (c.score as number | null) ?? 7
      const base = ((jikanScore / 10) * 30) + (jaccardScore * 45) + 17
      const confidence = Math.min(92, Math.max(55, Math.round(base)))

      // Build reason string
      const matchedGenres = overlap.slice(0, 2)
      const similarTo = manga
        .filter(m => m.genres?.some(g => overlap.includes(g)))
        .map(m => m.title)
        .slice(0, 1)

      let reason = ''
      if (matchedGenres.length > 0 && similarTo.length > 0) {
        reason = `Shares ${matchedGenres.join(' and ')} with ${similarTo[0]}${jikanScore >= 8.5 ? ` — MAL score ${jikanScore}` : ''}.`
      } else if (matchedGenres.length > 0) {
        reason = `Matches your taste for ${matchedGenres.join(' and ')}${jikanScore >= 8.5 ? ` — MAL score ${jikanScore}` : ''}.`
      } else {
        reason = `Top-rated manga (MAL score ${jikanScore}) that readers with similar lists enjoy.`
      }

      return {
        title: String(c.title ?? ''),
        confidence,
        reason,
        isAnime: false,
        score: jikanScore,
        overlap: overlap.length,
      }
    })

    // Sort by confidence desc, take top 5
    const recommendations: Recommendation[] = scored
      .sort((a, b) => b.confidence - a.confidence || b.overlap - a.overlap)
      .slice(0, 5)
      .map(c => ({
        title: c.title,
        mal_id: (filtered.find(f => String(f.title) === c.title)?.mal_id as number) ?? null,
        confidence: c.confidence,
        reason: c.reason,
        isAnime: c.isAnime,
      }))

    return NextResponse.json({ recommendations })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('recommend error:', msg)
    return NextResponse.json({ error: `Recommendation error: ${msg}` }, { status: 500 })
  }
}
