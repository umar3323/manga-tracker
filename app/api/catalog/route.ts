/**
 * Unified manga catalog API
 * Aggregates Jikan (multi-page), MangaDex (popular + trending + new),
 * and AniList (trending) into a single deduplicated pool of 400–600 manga.
 * Cached for 2 hours per cold-start.
 *
 * GET /api/catalog
 * Returns: { catalog: JikanSearchResult[], sources, cachedAt }
 */

import { NextResponse } from 'next/server'
import { getTopMangaMultiPage, type JikanSearchResult } from '@/lib/jikan'
import { getMangaDexPopular, getMangaDexTrending, getMangaDexNewReleases } from '@/lib/mangadex'
import { fetchAniListTrendingManga, aniListToJikanResult } from '@/lib/anilist'
import type { GoodreadsBook } from '@/app/api/goodreads/route'

interface CatalogCache {
  catalog: JikanSearchResult[]
  sources: { jikan: number; mangadex: number; anilist: number; goodreads: number }
  at: number
}

let _cache: CatalogCache | null = null
const CACHE_MS = 2 * 60 * 60 * 1000 // 2 hours

export async function GET() {
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ ..._cache, cached: true, cachedAt: new Date(_cache.at).toISOString() })
  }

  // Fetch all sources in parallel — any failure degrades gracefully
  const [jikanRaw, mdPopular, mdTrending, mdNew, alTrending, grTrending] = await Promise.allSettled([
    getTopMangaMultiPage(4),      // pages 1–4 = up to 100 from MAL top manga
    getMangaDexPopular(),          // 100 most-followed on MangaDex
    getMangaDexTrending(),         // 100 highest-rated ongoing
    getMangaDexNewReleases(),      // 100 new series (last 2 years)
    fetchAniListTrendingManga(2),  // 100 trending on AniList (2 pages × 50)
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/goodreads`)
      .then(r => r.json()).then(j => j.books as GoodreadsBook[]),
  ])

  const jikanItems   = jikanRaw.status   === 'fulfilled' ? jikanRaw.value   : []
  const mdPopItems   = mdPopular.status  === 'fulfilled' ? mdPopular.value  : []
  const mdTrendItems = mdTrending.status === 'fulfilled' ? mdTrending.value : []
  const mdNewItems   = mdNew.status      === 'fulfilled' ? mdNew.value      : []
  const alItems      = alTrending.status === 'fulfilled'
    ? alTrending.value.map(aniListToJikanResult)
    : []
  // Convert Goodreads books that have a MAL ID into catalog entries
  const grItems: JikanSearchResult[] = grTrending.status === 'fulfilled'
    ? (grTrending.value ?? [])
        .filter((b: GoodreadsBook) => b.malId)
        .map((b: GoodreadsBook) => ({
          mal_id: b.malId!,
          title: b.title,
          synopsis: null,
          cover_url: b.coverUrl,
          genres: [],
          total_chapters: null,
          score: b.rating,
          status: null,
          authors: b.author ? [{ id: 0, name: b.author }] : [],
        }))
    : []

  // Merge and deduplicate by MAL ID
  // Later sources fill in missing cover/synopsis for existing entries
  const byMalId = new Map<number, JikanSearchResult>()

  const merge = (items: JikanSearchResult[]) => {
    for (const m of items) {
      if (!m.mal_id || isNaN(m.mal_id)) continue
      const existing = byMalId.get(m.mal_id)
      if (!existing) {
        byMalId.set(m.mal_id, { ...m })
      } else {
        if (!existing.cover_url  && m.cover_url)   existing.cover_url  = m.cover_url
        if (!existing.synopsis   && m.synopsis)    existing.synopsis   = m.synopsis
        if (!existing.score      && m.score)       existing.score      = m.score
        if ((!existing.genres?.length) && m.genres?.length) existing.genres = m.genres
      }
    }
  }

  // Priority: Jikan has best scores, AniList has best covers, MangaDex has broadest coverage
  merge(jikanItems)
  merge(alItems)
  merge(mdPopItems)
  merge(mdTrendItems)
  merge(mdNewItems)
  merge(grItems) // Goodreads adds Western-market popularity signal + extra covers

  const catalog = [...byMalId.values()]

  const result: CatalogCache = {
    catalog,
    sources: {
      jikan:     jikanItems.length,
      mangadex:  mdPopItems.length + mdTrendItems.length + mdNewItems.length,
      anilist:   alItems.length,
      goodreads: grItems.length,
    },
    at: Date.now(),
  }
  _cache = result

  return NextResponse.json({ ...result, cached: false, cachedAt: new Date(result.at).toISOString() })
}
