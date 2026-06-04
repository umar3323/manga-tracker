/**
 * Unified manga catalog API — GET /api/catalog
 * Aggregates 13 parallel sources into a deduplicated pool of 600–900 entries.
 * Cached 2h in-memory; any source failure degrades gracefully.
 *
 * Dedup key priority:
 *  1. mal_id  (Jikan, MangaDex links.mal, ComicK links.mal, Kitsu mappings)
 *  2. hid     (ComicK hash ID when mal_id absent)
 *  3. kitsu:* (Kitsu ID for remaining non-MAL entries)
 *
 * Field fill priority (later sources fill gaps, never overwrite):
 *  Jikan scores → AniList covers → MangaDex breadth → ComicK manhwa → Kitsu ratings → GR/Webtoons signal
 *
 * Returns: { catalog: JikanSearchResult[], sources: { jikan, mangadex, anilist, goodreads, comick, kitsu, webtoons }, cachedAt }
 */

import { NextResponse } from 'next/server'
import { getTopMangaMultiPage, type JikanSearchResult } from '@/lib/jikan'
import {
  getMangaDexPopular, getMangaDexTrending, getMangaDexNewReleases,
  getMangaDexManhwa, getMangaDexManhua,
} from '@/lib/mangadex'
import { fetchAniListTrendingManga, aniListToJikanResult } from '@/lib/anilist'
import { getComicKPopular, getComicKTrending } from '@/lib/comick'
import { getTopManhwa, getKitsuTopManga } from '@/lib/kitsu'
import type { GoodreadsBook } from '@/app/api/goodreads/route'
import type { WebtoonSeries } from '@/app/api/webtoons/route'

interface CatalogCache {
  catalog: JikanSearchResult[]
  sources: {
    jikan: number; mangadex: number; anilist: number; goodreads: number
    comick: number; kitsu: number; webtoons: number
  }
  at: number
}

let _cache: CatalogCache | null = null
const CACHE_MS = 2 * 60 * 60 * 1000

export async function GET() {
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ ..._cache, cached: true, cachedAt: new Date(_cache.at).toISOString() })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const [
    jikanRaw, mdPop, mdTrend, mdNew, mdManhwa, mdManhua,
    alTrend,
    grRaw, wtRaw,
    ckPop, ckTrend,
    kitsuMh, kitsuTop,
  ] = await Promise.allSettled([
    getTopMangaMultiPage(4),           // 100 — MAL top manga, 4 pages
    getMangaDexPopular(),               // 100 — MangaDex most-followed
    getMangaDexTrending(),              // 100 — MangaDex highest-rated ongoing
    getMangaDexNewReleases(),           // 100 — new series last 2 years
    getMangaDexManhwa(),               // 100 — Korean manhwa (direct fix for silent-drop)
    getMangaDexManhua(),               // 100 — Chinese manhua
    fetchAniListTrendingManga(2),       // 100 — AniList trending (2 × 50)
    fetch(`${siteUrl}/api/goodreads`).then(r => r.json()).then(j => j.books as GoodreadsBook[]),
    fetch(`${siteUrl}/api/webtoons`).then(r => r.json()).then(j => j.series as WebtoonSeries[]),
    getComicKPopular(),                 // 100 — ComicK popular (all types, incl non-MAL)
    getComicKTrending(),                // 100 — ComicK weekly trending
    getTopManhwa(),                     // 20  — Kitsu manhwa + MAL bridge
    getKitsuTopManga(),                 // 20  — Kitsu top manga, community score signal
  ])

  // Unwrap settled values
  const jikanItems  = jikanRaw.status  === 'fulfilled' ? jikanRaw.value  : []
  const mdPopItems  = mdPop.status     === 'fulfilled' ? mdPop.value     : []
  const mdTrendI    = mdTrend.status   === 'fulfilled' ? mdTrend.value   : []
  const mdNewI      = mdNew.status     === 'fulfilled' ? mdNew.value     : []
  const mdManhwaI   = mdManhwa.status  === 'fulfilled' ? mdManhwa.value  : []
  const mdManhuaI   = mdManhua.status  === 'fulfilled' ? mdManhua.value  : []
  const alItems     = alTrend.status   === 'fulfilled' ? alTrend.value.map(aniListToJikanResult) : []
  const grItems: JikanSearchResult[] = grRaw.status === 'fulfilled'
    ? (grRaw.value ?? []).filter((b: GoodreadsBook) => b.malId).map((b: GoodreadsBook) => ({
        mal_id: b.malId!, title: b.title, synopsis: null, cover_url: b.coverUrl,
        genres: [], total_chapters: null, score: b.rating, status: null, authors: [],
        source: 'goodreads', country: 'jp' as const,
      }))
    : []
  const wtItems: JikanSearchResult[] = wtRaw.status === 'fulfilled'
    ? (wtRaw.value ?? []).map((s: WebtoonSeries) => webtoonToJikanResult(s))
    : []
  const ckPopI      = ckPop.status     === 'fulfilled' ? ckPop.value     : []
  const ckTrendI    = ckTrend.status   === 'fulfilled' ? ckTrend.value   : []
  const kitsuMhI    = kitsuMh.status   === 'fulfilled' ? kitsuMh.value   : []
  const kitsuTopI   = kitsuTop.status  === 'fulfilled' ? kitsuTop.value  : []

  // ── Dual-key dedup ──────────────────────────────────────────────────────
  const byMalId = new Map<number, JikanSearchResult>()  // primary: MAL ID
  const byHid   = new Map<string, JikanSearchResult>()  // secondary: hid / kitsu:ID

  function mergeInto(map: Map<number | string, JikanSearchResult>, key: number | string, m: JikanSearchResult) {
    const existing = map.get(key as number) ?? map.get(key as string)
    if (!existing) {
      if (typeof key === 'number') byMalId.set(key, { ...m })
      else byHid.set(key, { ...m })
    } else {
      if (!existing.cover_url  && m.cover_url)   existing.cover_url  = m.cover_url
      if (!existing.synopsis   && m.synopsis)    existing.synopsis   = m.synopsis
      if (!existing.score      && m.score)       existing.score      = m.score
      if (!existing.genres?.length && m.genres?.length) existing.genres = m.genres
      if (!existing.country    && m.country)     existing.country    = m.country
    }
  }

  function merge(items: JikanSearchResult[]) {
    for (const m of items) {
      if (m.mal_id && !isNaN(m.mal_id)) {
        mergeInto(byMalId, m.mal_id, m)
      } else if (m.hid) {
        // Non-MAL entry: key by hid; later if a MAL-linked entry arrives for same series it takes over
        mergeInto(byHid, m.hid, m)
      }
      // entries with neither mal_id nor hid are silently dropped
    }
  }

  // Priority: best scores → best covers → broadest coverage → regional/Western signal
  merge(jikanItems)   // MAL scores most accurate
  merge(alItems)      // AniList: great covers + verified scores
  merge(kitsuTopI)    // Kitsu: community score tiebreaker
  merge(mdPopItems)   // MangaDex: broad coverage
  merge(mdTrendI)
  merge(mdNewI)
  merge(mdManhwaI)    // MangaDex manhwa — direct fix for silent-drop
  merge(mdManhuaI)    // MangaDex manhua
  merge(ckPopI)       // ComicK: covers non-MAL entries via hid
  merge(ckTrendI)
  merge(kitsuMhI)     // Kitsu manhwa
  merge(grItems)      // Goodreads: Western popularity signal
  merge(wtItems)      // Webtoons: manhwa originals

  const catalog = [...byMalId.values(), ...byHid.values()]

  const result: CatalogCache = {
    catalog,
    sources: {
      jikan:     jikanItems.length,
      mangadex:  mdPopItems.length + mdTrendI.length + mdNewI.length + mdManhwaI.length + mdManhuaI.length,
      anilist:   alItems.length,
      goodreads: grItems.length,
      comick:    ckPopI.length + ckTrendI.length,
      kitsu:     kitsuMhI.length + kitsuTopI.length,
      webtoons:  wtItems.length,
    },
    at: Date.now(),
  }
  _cache = result

  return NextResponse.json({ ...result, cached: false, cachedAt: new Date(result.at).toISOString() })
}

function webtoonToJikanResult(s: WebtoonSeries): JikanSearchResult {
  return {
    mal_id: null,
    title: s.title,
    synopsis: null,
    cover_url: s.thumbnailUrl,
    genres: s.genre ? [s.genre] : [],
    total_chapters: null,
    score: null,
    status: 'publishing',
    authors: s.author ? [{ id: 0, name: s.author }] : [],
    hid: `webtoons:${s.titleNo}`,
    source: 'webtoons',
    country: 'kr',
  }
}
