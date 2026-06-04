import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { JikanSearchResult } from '@/lib/jikan'

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
  user_rating?: 'up' | 'down' | null
}

export async function POST(req: NextRequest) {
  try {
    const {
      manga,
      likedGenres = [],
      dislikedGenres = [],
      animeRatings = {},
    }: { manga: MangaEntry[]; likedGenres?: string[]; dislikedGenres?: string[]; animeRatings?: Record<string, 'up' | 'down'> } = await req.json()

    // Build genre preference profile from user's list + liked genres from swipes
    const genreScore: Record<string, number> = {}
    const addedMalIds = new Set<number>(manga.map(m => m.mal_id).filter(Boolean) as number[])
    const addedTitles = new Set(manga.map(m => m.title.toLowerCase()))

    // Weight genres from the user's own list
    // thumbs up = big boost, thumbs down = penalty, reading/completed = higher base weight
    for (const m of manga) {
      const ratingMult = m.user_rating === 'up' ? 3 : m.user_rating === 'down' ? -1.5 : 1
      const statusWeight = m.status === 'reading' ? 2 : m.status === 'completed' ? 1.5 : 1
      const weight = ratingMult * statusWeight
      for (const g of m.genres ?? []) {
        genreScore[g] = (genreScore[g] ?? 0) + weight
      }
    }
    // Boost genres from right-swipes, penalise from left-swipes
    for (const g of likedGenres)    genreScore[g] = (genreScore[g] ?? 0) + 1.5
    for (const g of dislikedGenres) genreScore[g] = (genreScore[g] ?? 0) - 1.0
    // Anime ratings — look up animeData genres via the animeRatings map
    // We don't have genres for anime here, but we can boost/penalise based on title overlap
    // Store rated anime titles for use in scoring below
    const likedAnimeTitles = new Set(
      Object.entries(animeRatings).filter(([, r]) => r === 'up').map(([t]) => t.toLowerCase())
    )
    const dislikedAnimeTitles = new Set(
      Object.entries(animeRatings).filter(([, r]) => r === 'down').map(([t]) => t.toLowerCase())
    )

    // Top 3 genres by score
    const topGenres = Object.entries(genreScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)

    // Build AniList tag weight vector from cached data
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const malIds = manga.map(m => m.mal_id).filter(Boolean)
    const tagWeights: Record<string, number> = {}
    if (malIds.length > 0) {
      const { data: alCache } = await supabase
        .from('anilist_cache')
        .select('payload')
        .in('mal_id', malIds)
        .eq('media_type', 'MANGA')
      for (const row of (alCache ?? [])) {
        const tags: { name: string; rank: number }[] = row.payload?.tags ?? []
        for (const t of tags) {
          if (t.rank >= 50) {
            const w = (t.rank / 100) * (genreScore[t.name] ?? 0.5)
            tagWeights[t.name] = (tagWeights[t.name] ?? 0) + w
          }
        }
      }
    }

    // Fetch unified catalog (large pool from Jikan + MangaDex + AniList)
    const origin = new URL(req.url).origin
    let catalog: JikanSearchResult[] = []
    try {
      const catRes = await fetch(`${origin}/api/catalog`, { signal: AbortSignal.timeout(30000) })
      if (catRes.ok) catalog = (await catRes.json()).catalog ?? []
    } catch { /* fall through — scoring on empty catalog returns empty recs */ }

    // Pull publisher feeds for confidence boosts (SJ +5, MangaPlus +5)
    let sjTitles = new Set<string>()
    let mpTitles = new Set<string>()
    await Promise.allSettled([
      fetch(`${origin}/api/shonenjump`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.json()).then(j => {
          sjTitles = new Set((j.chapters ?? []).map((c: { title: string }) => c.title.toLowerCase()))
        }),
      fetch(`${origin}/api/mangaplus`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.json()).then(j => {
          mpTitles = new Set((j.chapters ?? []).map((c: { title: string }) => c.title.toLowerCase()))
        }),
    ])

    // Filter out manga already in user's library
    const filtered = catalog.filter(c => {
      if (!c.mal_id) return false
      if (addedMalIds.has(c.mal_id)) return false
      if (addedTitles.has(c.title.toLowerCase())) return false
      return true
    })

    // Only consider genres with a positive score for matching
    const userGenreSet = new Set(Object.keys(genreScore).filter(g => genreScore[g] > 0))

    // Score each candidate
    const scored = filtered.map(c => {
      const cGenres = c.genres ?? []

      const overlap = cGenres.filter(g => userGenreSet.has(g))
      const jaccardScore = overlap.length / Math.max(userGenreSet.size, cGenres.length, 1)

      // Penalise genres the user has rated down
      const dislikedOverlap = cGenres.filter(g => (genreScore[g] ?? 0) < -0.5).length
      const dislikePenalty = dislikedOverlap * 8

      // AniList tag overlap bonus
      const tagBonus = cGenres.reduce((s, g) => s + (tagWeights[g] ?? 0), 0)
      const tagBonusNorm = Math.min(1, tagBonus / 5)

      // Publisher boosts — active serialization signals
      const titleLow = c.title.toLowerCase()
      const sjBonus = sjTitles.has(titleLow) ? 5 : 0
      const mpBonus = mpTitles.has(titleLow) ? 5 : 0

      // Anime rating cross-signal: if this manga title matches a liked/disliked anime, adjust
      const animeAffinityBonus = likedAnimeTitles.has(titleLow) ? 5 : dislikedAnimeTitles.has(titleLow) ? -10 : 0

      // MangaUpdates activity boost: +2 if series is weekly/biweekly (from catalog source tag)
      // We use the country/source heuristic: non-complete + MAL score > 7 = likely active
      const muBonus = (!c.status || c.status === 'publishing') &&
        (c.score ?? 0) > 7 ? 2 : 0

      const baseScore = (c.score ?? 7)
      const base = ((baseScore / 10) * 25) + (jaccardScore * 40) + (tagBonusNorm * 15) + 17 + sjBonus + mpBonus + muBonus + animeAffinityBonus - dislikePenalty
      const confidence = Math.min(95, Math.max(55, Math.round(base)))

      const matchedGenres = overlap.slice(0, 2)
      const similarTo = manga
        .filter(m => m.genres?.some(g => overlap.includes(g)))
        .map(m => m.title).slice(0, 1)

      const topTag = Object.entries(tagWeights)
        .filter(([name]) => cGenres.includes(name))
        .sort((a, b) => b[1] - a[1])[0]?.[0]

      let reason = ''
      if (matchedGenres.length > 0 && similarTo.length > 0) {
        reason = `Shares ${matchedGenres.join(' and ')} with ${similarTo[0]}${topTag && !matchedGenres.includes(topTag) ? ` · strong ${topTag} themes` : ''}${baseScore >= 8.5 ? ` — score ${baseScore}` : ''}.`
      } else if (matchedGenres.length > 0) {
        reason = `Matches your taste for ${matchedGenres.join(' and ')}${topTag ? ` with strong ${topTag} elements` : ''}${baseScore >= 8.5 ? ` — score ${baseScore}` : ''}.`
      } else {
        reason = `Highly rated ${topTag ? `${topTag} ` : ''}manga${sjBonus ? ' currently in Shonen Jump' : mpBonus ? ' on MangaPlus' : ''} that readers with similar lists enjoy.`
      }

      return { title: c.title, mal_id: c.mal_id, confidence, reason, overlap: overlap.length }
    })

    // Sort by confidence desc, take top 5
    const recommendations: Recommendation[] = scored
      .sort((a, b) => b.confidence - a.confidence || b.overlap - a.overlap)
      .slice(0, 5)
      .map(c => ({
        title: c.title,
        mal_id: c.mal_id,
        confidence: c.confidence,
        reason: c.reason,
        isAnime: false,
      }))

    return NextResponse.json({ recommendations })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('recommend error:', msg)
    return NextResponse.json({ error: `Recommendation error: ${msg}` }, { status: 500 })
  }
}
