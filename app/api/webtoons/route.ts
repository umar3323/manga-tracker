/**
 * Webtoons series feed — webtoons.com/en/genre
 * HTML scrape. Cache: 2h. Serve stale on failure.
 * NOTE: markup changes return empty array silently, same caveat as Goodreads.
 *
 * Parsed fields per card:
 *   title_no (Webtoons series ID), title, author, genre, thumbnail URL,
 *   likes count (view_count), series URL, is_free (all Webtoons originals = free)
 */

import { NextResponse } from 'next/server'

export interface WebtoonSeries {
  titleNo: string
  title: string
  author: string | null
  genre: string | null
  likesCount: string | null
  thumbnailUrl: string | null
  seriesUrl: string
  isFree: boolean
}

let _cache: { series: WebtoonSeries[]; at: number } | null = null
const CACHE_MS = 2 * 60 * 60 * 1000  // 2h

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

function parseSeries(html: string): WebtoonSeries[] {
  const series: WebtoonSeries[] = []
  const seen = new Set<string>()

  // Each series block: <a href="...title_no=NNN" data-genre="GENRE" ...>
  //   <img src="THUMB" ...>
  //   <strong class="title">TITLE</strong>
  //   <div class="author">AUTHOR</div>
  //   <div class="view_count type_like">LIKES</div>
  // </a>
  const blockRe = /href="(https?:\/\/www\.webtoons\.com\/en\/[^"]+\/list\?title_no=(\d+))"[^>]*data-genre="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const thumbRe = /src="(https:\/\/webtoon-phinf[^"]+)"/
  const titleRe = /<strong[^>]*class="title"[^>]*>([^<]+)<\/strong>/
  const authorRe = /<div[^>]*class="author"[^>]*>([^<]+)<\/div>/
  const likesRe = /<div[^>]*class="view_count[^"]*"[^>]*>([\d,]+)<\/div>/

  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    const [, url, titleNo, genre, inner] = m
    if (seen.has(titleNo)) continue
    seen.add(titleNo)

    const thumbMatch = thumbRe.exec(inner)
    const titleMatch = titleRe.exec(inner)
    const authorMatch = authorRe.exec(inner)
    const likesMatch = likesRe.exec(inner)

    if (!titleMatch) continue

    series.push({
      titleNo,
      title: titleMatch[1].trim(),
      author: authorMatch?.[1]?.trim() ?? null,
      genre: genre || null,
      likesCount: likesMatch?.[1] ?? null,
      thumbnailUrl: thumbMatch?.[1] ?? null,
      seriesUrl: url,
      isFree: true,  // Webtoons Originals are all free to read
    })
  }

  return series
}

export async function GET() {
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ series: _cache.series, cached: true })
  }

  try {
    const res = await fetch('https://www.webtoons.com/en/genre', {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      if (_cache) return NextResponse.json({ series: _cache.series, cached: true, stale: true })
      return NextResponse.json({ series: [] })
    }

    const html = await res.text()
    const series = parseSeries(html)

    _cache = { series, at: Date.now() }
    return NextResponse.json({ series, cached: false, total: series.length })
  } catch {
    if (_cache) return NextResponse.json({ series: _cache.series, cached: true, stale: true })
    return NextResponse.json({ series: [] })
  }
}
