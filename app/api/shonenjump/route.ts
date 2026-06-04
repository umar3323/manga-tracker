import { NextResponse } from 'next/server'

export interface SJChapter {
  seriesSlug: string        // e.g. "one-piece"
  title: string             // e.g. "One Piece"
  chapter: string           // e.g. "1184"
  vizUrl: string            // full viz.com chapter URL
  seriesUrl: string         // full viz.com series page URL
  isFree: boolean
}

// Simple in-memory cache (per cold-start, good enough for Next.js edge/serverless)
let _cache: { data: SJChapter[]; at: number } | null = null
const CACHE_MS = 60 * 60 * 1000 // 1 hour

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function parseChapters(html: string): SJChapter[] {
  // Match chapter links like:
  // href="/shonenjump/one-piece-chapter-1184/chapter/50047"
  // href="/shonenjump/dandadan-chapter-235/chapter/50044"
  const chapterRe = /href="(\/shonenjump\/([a-z0-9-]+)-chapter-([\d.]+)\/chapter\/(\d+))"/g

  const seen = new Set<string>()
  const results: SJChapter[] = []

  // Detect the free chapters section boundary — everything before the "fan favorites"
  // or "vault" headings is treated as the main/free section.
  const freeEnd = Math.max(
    html.indexOf('Fan Favorites'),
    html.indexOf('fan-favorites'),
    html.indexOf('Latest Vault'),
    html.indexOf('vault-chapters'),
  )

  let m: RegExpExecArray | null
  while ((m = chapterRe.exec(html)) !== null) {
    const [, path, seriesSlug, chapterNum] = m
    const pos = m.index

    if (seen.has(seriesSlug)) continue
    seen.add(seriesSlug)

    const isFree = freeEnd < 0 || pos < freeEnd

    results.push({
      seriesSlug,
      title: slugToTitle(seriesSlug),
      chapter: chapterNum,
      vizUrl: `https://www.viz.com${path}`,
      seriesUrl: `https://www.viz.com/shonenjump/chapters/${seriesSlug}`,
      isFree,
    })
  }

  return results
}

export async function GET() {
  // Serve cache if fresh
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ chapters: _cache.data, cached: true })
  }

  try {
    const res = await fetch('https://www.viz.com/shonenjump', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YOMUBot/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch Shonen Jump', chapters: _cache?.data ?? [] }, { status: 502 })
    }

    const html = await res.text()
    const chapters = parseChapters(html)

    _cache = { data: chapters, at: Date.now() }
    return NextResponse.json({ chapters, cached: false })
  } catch {
    // Return stale cache rather than error if we have it
    if (_cache) return NextResponse.json({ chapters: _cache.data, cached: true, stale: true })
    return NextResponse.json({ error: 'Failed to reach Shonen Jump', chapters: [] }, { status: 502 })
  }
}
