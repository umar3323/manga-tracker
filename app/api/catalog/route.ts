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
import { getMangaDexPopular, getMangaDexTrending, getMangaDexNewReleases, getMangaDexManhwa, getMangaDexManhua } from '@/lib/mangadex'
import { fetchAniListTrendingManga, aniListToJikanResult } from '@/lib/anilist'
import { getComicKTrending, getComicKManhwa, getComicKManhua } from '@/lib/comick'
import { getKitsuManhwa, getKitsuTopManga } from '@/lib/kitsu'
import type { GoodreadsBook } from '@/app/api/goodreads/route'

interface CatalogCache {
  catalog: JikanSearchResult[]
  sources: {
    jikan: number; mangadex: number; anilist: number; goodreads: number
    comick: number; kitsu: number
  }
  at: number
}

let _cache: CatalogCache | null = null
const CACHE_MS = 2 * 60 * 60 * 1000 // 2 hours

export async function GET() {
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ ..._cache, cached: true, cachedAt: new Date(_cache.at).toISOString() })
  }

  // Fetch all sources in parallel — any failure degrades gracefully
  const [
    jikanRaw, mdPopular, mdTrending, mdNew, mdManhwa, mdManhua,
    alTrending, grTrending,
    comickTrend, comickManhwa, comickManhua,
    kitsuManhwa, kitsuTop,
  ] = await Promise.allSettled([
    getTopMangaMultiPage(4),      // up to 100 from MAL top manga (4 pages)
    getMangaDexPopular(),          // 100 most-followed
    getMangaDexTrending(),         // 100 highest-rated ongoing
    getMangaDexNewReleases(),      // 100 new series (last 2 years)
    getMangaDexManhwa(),           // 100 Korean manhwa — fixes silent-drop gap
    getMangaDexManhua(),           // 100 Chinese manhua
    fetchAniListTrendingManga(2),  // 100 trending on AniList (2 × 50)
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/goodreads`)
      .then(r => r.json()).then(j => j.books as GoodreadsBook[]),
    getComicKTrending(),           // ComicK weekly trending (MAL-linked entries only)
    getComicKManhwa(),             // ComicK manhwa
    getComicKManhua(),             // ComicK manhua
    getKitsuManhwa(),              // Kitsu manhwa (20 entries with MAL ID bridge)
    getKitsuTopManga(),            // Kitsu top manga — extra community score signal
  ])

  const jikanItems    = jikanRaw.status     === 'fulfilled' ? jikanRaw.value     : []
  const mdPopItems    = mdPopular.status    === 'fulfilled' ? mdPopular.value    : []
  const mdTrendItems  = mdTrending.status   === 'fulfilled' ? mdTrending.value   : []
  const mdNewItems    = mdNew.status        === 'fulfilled' ? mdNew.value        : []
  const mdManhwaItems = mdManhwa.status     === 'fulfilled' ? mdManhwa.value     : []
  const mdManhuaItems = mdManhua.status     === 'fulfilled' ? mdManhua.value     : []
  const alItems       = alTrending.status   === 'fulfilled'
    ? alTrending.value.map(aniListToJikanResult) : []
  const grItems: JikanSearchResult[] = grTrending.status === 'fulfilled'
    ? (grTrending.value ?? [])
        .filter((b: GoodreadsBook) => b.malId)
        .map((b: GoodreadsBook) => ({
          mal_id: b.malId!, title: b.title, synopsis: null, cover_url: b.coverUrl,
          genres: [], total_chapters: null, score: b.rating, status: null,
          authors: b.author ? [{ id: 0, name: b.author }] : [],
        }))
    : []
  const ckTrendItems  = comickTrend.status  === 'fulfilled' ? comickTrend.value  : []
  const ckManhwaItems = comickManhwa.status === 'fulfilled' ? comickManhwa.value : []
  const ckManhuaItems = comickManhua.status === 'fulfilled' ? comickManhua.value : []
  const kitsuMhItems  = kitsuManhwa.status  === 'fulfilled' ? kitsuManhwa.value  : []
  const kitsuTopItems = kitsuTop.status     === 'fulfilled' ? kitsuTop.value     : []

  // Merge and deduplicate by MAL ID — later sources fill in missing fields
  const byMalId = new Map<number, JikanSearchResult>()

  const merge = (items: JikanSearchResult[]) => {
    for (const m of items) {
      if (!m.mal_id || isNaN(m.mal_id)) continue
      const existing = byMalId.get(m.mal_id)
      if (!existing) {
        byMalId.set(m.mal_id, { ...m })
      } else {
        if (!existing.cover_url  && m.cover_url)            existing.cover_url  = m.cover_url
        if (!existing.synopsis   && m.synopsis)             existing.synopsis   = m.synopsis
        if (!existing.score      && m.score)                existing.score      = m.score
        if (!existing.genres?.length && m.genres?.length)   existing.genres     = m.genres
      }
    }
  }

  // Priority order: best scores first, best covers second, broadest coverage last
  merge(jikanItems)       // MAL scores are most accurate
  merge(alItems)          // AniList has great covers + verified scores
  merge(kitsuTopItems)    // Kitsu community score as tiebreaker
  merge(mdPopItems)       // MangaDex broad coverage
  merge(mdTrendItems)
  merge(mdNewItems)
  merge(mdManhwaItems)    // MangaDex manhwa — direct fix for the dropped-entry bug
  merge(mdManhuaItems)    // MangaDex manhua
  merge(ckTrendItems)     // ComicK trending (MAL-linked entries)
  merge(ckManhwaItems)    // ComicK manhwa extras
  merge(ckManhuaItems)    // ComicK manhua extras
  merge(kitsuMhItems)     // Kitsu manhwa
  merge(grItems)          // Goodreads Western-market signal

  const catalog = [...byMalId.values()]

  const result: CatalogCache = {
    catalog,
    sources: {
      jikan:     jikanItems.length,
      mangadex:  mdPopItems.length + mdTrendItems.length + mdNewItems.length + mdManhwaItems.length + mdManhuaItems.length,
      anilist:   alItems.length,
      goodreads: grItems.length,
      comick:    ckTrendItems.length + ckManhwaItems.length + ckManhuaItems.length,
      kitsu:     kitsuMhItems.length + kitsuTopItems.length,
    },
    at: Date.now(),
  }
  _cache = result

  return NextResponse.json({ ...result, cached: false, cachedAt: new Date(result.at).toISOString() })
}
